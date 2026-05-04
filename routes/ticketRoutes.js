const express = require('express');
const router = express.Router();
const axios = require('axios');

module.exports = (pool) => {

    /**
     * HELPER: Send Telegram Message
     */
    const sendTelegramAlert = async (ticketData) => {
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        if (!BOT_TOKEN || !CHAT_ID) {
            console.warn("⚠️ Telegram credentials missing in .env file");
            return;
        }

        const message = `
🚨 *NEW HELPDESK TICKET* 🚨
------------------------------------
📌 *Title:* ${ticketData.title}
📂 *Category:* ${ticketData.category}
⚡ *Priority:* ${ticketData.priority}
💻 *PC Number:* ${ticketData.pc_number}
👤 *Assigned:* ${ticketData.assigned_to}
------------------------------------
🕒 ${new Date().toLocaleString('en-US', { hour12: true })}
_Action Required: Visit the Dashboard to update status._
        `;

        try {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            });
            console.log("✅ Telegram alert posted to channel!");
        } catch (error) {
            console.error("❌ Telegram API Error:", error.response?.data || error.message);
        }
    };

    // 1. GET ALL TICKETS
    router.get('/all', (req, res) => {
        const sql = "SELECT * FROM tickets ORDER BY id DESC";
        pool.query(sql, (err, results) => {
            if (err) return res.status(500).json({ error: "Failed to load tickets" });
            res.json(results);
        });
    });

    // 2. CREATE NEW TICKET
    router.post('/create', (req, res) => {
        const { title, category, priority, pc_number, assigned_to } = req.body;
        const cleanPcNumber = pc_number ? pc_number.toString().trim() : 'N/A';

        const sql = `
            INSERT INTO tickets (title, category, priority, pc_number, assigned_to, status) 
            VALUES (?, ?, ?, ?, ?, 'Open')
        `;

        const finalPriority = priority || 'Medium';
        const finalAssigned = assigned_to || 'Unassigned';

        pool.query(sql, [title, category, finalPriority, cleanPcNumber, finalAssigned], (err, result) => {
            if (err) {
                console.error("❌ Insert Error:", err);
                return res.status(500).json({ error: "Failed to create ticket" });
            }

            sendTelegramAlert({ 
                title, category, priority: finalPriority, 
                pc_number: cleanPcNumber, assigned_to: finalAssigned 
            });

            res.status(201).json({ success: true, id: result.insertId });
        });
    });

    // 3. RESOLVE / UPDATE TICKET STATUS
    router.put('/resolve/:id', (req, res) => {
        const { id } = req.params;
        const { status, resolver, role } = req.body;

        if (!status || !resolver) {
            return res.status(400).json({ 
                success: false, 
                message: "Status and Resolver name are required" 
            });
        }

        const sql = `
            UPDATE tickets 
            SET 
                status = ?, 
                resolved_by = ?, 
                resolved_at = CASE WHEN ? = 'Resolved' THEN CURRENT_TIMESTAMP ELSE resolved_at END 
            WHERE id = ?
        `;

        pool.query(sql, [status, resolver, status, id], (err, result) => {
            if (err) {
                console.error("❌ Database Error during resolve:", err);
                return res.status(500).json({ error: "Failed to update ticket status" });
            }

            if (result.affectedRows > 0) {
                res.json({ 
                    success: true, 
                    message: `Ticket updated to ${status} by ${role || 'User'}` 
                });
            } else {
                res.status(404).json({ success: false, message: "Ticket not found" });
            }
        });
    });

    // 4. ANALYTICS
    router.get('/analytics', (req, res) => {
        const { staffStart, staffEnd, pcStart, pcEnd } = req.query;

        const statsSql = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN status != 'Resolved' THEN 1 ELSE 0 END) as open
            FROM tickets;
        `;
        
        let perPersonSql = `
            SELECT resolved_by as name, COUNT(*) as count 
            FROM tickets 
            WHERE status = 'Resolved' AND resolved_by IS NOT NULL AND resolved_by != ''
        `;
        const staffParams = [];
        if (staffStart && staffEnd) {
            perPersonSql += ` AND created_at BETWEEN ? AND ? `;
            staffParams.push(`${staffStart} 00:00:00`, `${staffEnd} 23:59:59`);
        }
        perPersonSql += ` GROUP BY resolved_by ORDER BY count DESC;`;

        let perPcSql = `
            SELECT pc_number, COUNT(*) as count 
            FROM tickets 
            WHERE pc_number IS NOT NULL AND pc_number != ''
        `;
        const pcParams = [];
        if (pcStart && pcEnd) {
            perPcSql += ` AND created_at BETWEEN ? AND ? `;
            pcParams.push(`${pcStart} 00:00:00`, `${pcEnd} 23:59:59`);
        }
        perPcSql += ` GROUP BY pc_number ORDER BY count DESC LIMIT 10;`;

        pool.query(statsSql, (err, overview) => {
            if (err) return res.status(500).json({ error: err.message });
            
            pool.query(perPersonSql, staffParams, (err, personStats) => {
                if (err) return res.status(500).json({ error: err.message });

                pool.query(perPcSql, pcParams, (err, pcStats) => {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    res.json({
                        overview: overview[0],
                        byPerson: personStats,
                        byPc: pcStats
                    });
                });
            });
        });
    });

    // 5. PC AUDIT HISTORY (Updated with Date Filters)
    router.get('/pc-history/:pcNumber', (req, res) => {
        const { pcNumber } = req.params;
        const { startDate, endDate } = req.query;

        let sql = `
            SELECT created_at, category as issue_type, title, resolved_by, assigned_to, status 
            FROM tickets 
            WHERE pc_number = ?
        `;
        const params = [pcNumber];

        if (startDate && endDate) {
            sql += ` AND created_at BETWEEN ? AND ? `;
            params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        sql += ` ORDER BY created_at DESC`;

        pool.query(sql, params, (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results);
        });
    });

    // 6. STAFF RESOLUTION HISTORY (Updated with Date Filters)
    router.get('/staff-history/:staffName', (req, res) => {
        const { staffName } = req.params;
        const { startDate, endDate } = req.query;
        
        let sql = `
            SELECT id, created_at, category, title, pc_number, status 
            FROM tickets 
            WHERE LOWER(resolved_by) = LOWER(?) AND status = 'Resolved'
        `;
        const params = [staffName];

        if (startDate && endDate) {
            sql += ` AND created_at BETWEEN ? AND ? `;
            params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        sql += ` ORDER BY created_at DESC`;

        pool.query(sql, params, (err, results) => {
            if (err) {
                console.error("❌ Database error in staff history:", err);
                return res.status(500).json({ error: "Database query failed" });
            }
            res.json(results);
        });
    });

    return router;
};