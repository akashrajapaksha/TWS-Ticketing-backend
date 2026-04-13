const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    
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

    // 2. Create New Ticket (WITH SANITIZATION)
    router.post('/create', (req, res) => {
        const { title, category, priority, pc_number, assigned_to } = req.body;
        
        // CLEANUP: Ensure pc_number has no hidden spaces or newlines before saving
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

    // 5. Audit History (FIXED FOR HIDDEN WHITESPACE)
    // Uses LIKE %...% to find the PC number even if it contains newlines or spaces
    router.get('/pc-history/:pcNumber', (req, res) => {
        const { pcNumber } = req.params;
        
        // We use LIKE and wrap the search term in wildcards to bypass formatting issues
        const sql = `
            SELECT 
                created_at, 
                category as issue_type, 
                title, 
                assigned_to, 
                status 
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