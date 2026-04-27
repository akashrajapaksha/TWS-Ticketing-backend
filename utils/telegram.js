const axios = require('axios');

const sendTicketNotification = async (ticketData) => {
    // Replace these with your actual details
    const BOT_TOKEN = 'YOUR_EXISTING_BOT_TOKEN'; 
    const CHAT_ID = 'YOUR_CHAT_ID_OR_GROUP_ID'; 

    const message = `
🆕 *New Support Request*
----------------------------
👤 *From:* ${ticketData.full_name}
💻 *PC Name:* ${ticketData.pc_name}
📌 *Issue:* ${ticketData.subject}
📝 *Details:* ${ticketData.description}
----------------------------
🕒 ${new Date().toLocaleString()}
    `;

    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
        });
        console.log("Telegram notification sent!");
    } catch (error) {
        console.error("Telegram Error:", error.response?.data || error.message);
    }
};

module.exports = { sendTicketNotification };