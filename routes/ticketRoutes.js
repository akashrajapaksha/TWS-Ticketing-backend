const express = require('express');
const router = express.Router();
const axios = require('axios'); // Added axios for Telegram

module.exports = (pool) => {

    // HELPER: Send Telegram Message
    const sendTelegramAlert = async (ticketData) => {
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        if (!BOT_TOKEN || !CHAT_ID) {
            console.warn("⚠️ Telegram credentials missing in .env file");
            return;
        }

        const message = `
🚨 *New HelpDesk Ticket*
--------------------------
📌 *Title:* ${ticketData.title}
📂 *Category:* ${ticketData.category}
⚡ *Priority:* ${ticketData.priority}
💻 *PC Number:* ${ticketData.pc_number}
👤 *Assigned:* ${ticketData.assigned_to}
--------------------------
_Check the dashboard to resolve._
        `;

        try {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            });
            console.log("✅ Telegram notification sent!");
        } catch (error) {
            console.error("❌ Telegram Error:", error.response?.data || error.message);
        }
    };

    // 1. Get All Tickets (Standard Queue)
    router.get('/all', (req, res) => {
        const sql = "SELECT * FROM tickets ORDER BY id DESC";
        pool.query(sql, (err, results) => {
            if (err) {
                console.error("❌ Fetch Error:", err);
                return res.status(500).json({ error: err.message });
            }
            res.json(results);
        });
    });

    // 2. Create New Ticket (WITH TELEGRAM NOTIFICATION)
    router.post('/create', (req, res) => {
        const { title, category, priority, pc_number, assigned_to } = req.body;
        
        const cleanPcNumber = pc_number ? pc_number.toString().trim() : '';

        const sql = `
            INSERT INTO tickets (title, category, priority, pc_number, assigned_to, status) 
            VALUES (?, ?, ?, ?, ?, 'Open')
        `;

        pool.query(sql, [title, category, priority, cleanPcNumber, assigned_to], (err, result) => {
            if (err) {
                console.error("❌ Insert Error:", err);
                return res.status(500).json({ error: err.message });
            }

            // TRIGGER TELEGRAM ALERT
            sendTelegramAlert({ title, category, priority, pc_number: cleanPcNumber, assigned_to });

            res.status(201).json({ success: true, id: result.insertId });
        });
    });

    // 3. Resolve Ticket 
    router.put('/resolve/:id', (req, res) => {
        const { id } = req.params;
        const { resolver } = req.body; 
        const sql = "UPDATE tickets SET status = 'Resolved', assigned_to = ? WHERE id = ?";
        
        pool.query(sql, [resolver, id], (err, result) => {
            if (err) {
                console.error("❌ Resolve Error:", err);
                return res.status(500).json({ error: "DB Update Failed" });
            }
            res.json({ success: true, message: `Ticket #${id} resolved by ${resolver}` });
        });
    });

    // 4. Get Analytics for Report Page
    router.get('/analytics', (req, res) => {
        const statsSql = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN status != 'Resolved' THEN 1 ELSE 0 END) as open
            FROM tickets;
        `;
        
        const perPersonSql = `
            SELECT assigned_to as name, COUNT(*) as count 
            FROM tickets 
            WHERE status = 'Resolved' AND assigned_to != 'Unassigned'
            GROUP BY assigned_to
            ORDER BY count DESC;
        `;

        pool.query(statsSql, (err, overview) => {
            if (err) return res.status(500).json({ error: err.message });
            pool.query(perPersonSql, (err, personStats) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({
                    overview: overview[0],
                    byPerson: personStats
                });
            });
        });
    });

    // 5. Audit History
    router.get('/pc-history/:pcNumber', (req, res) => {
        const { pcNumber } = req.params;
        const sql = `
            SELECT created_at, category as issue_type, title, assigned_to, status 
            FROM tickets 
            WHERE pc_number LIKE ? 
            ORDER BY created_at DESC
        `;

        pool.query(sql, [`%${pcNumber}%`], (err, results) => {
            if (err) {
                console.error("❌ PC History Error:", err);
                return res.status(500).json({ error: err.message });
            }
            res.json(results);
        });
    });

    return router;
};