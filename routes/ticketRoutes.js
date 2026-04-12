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

    // 2. Create New Ticket
    router.post('/create', (req, res) => {
        const { title, category, priority, pc_number, assigned_to } = req.body;
        const sql = `
            INSERT INTO tickets (title, category, priority, pc_number, assigned_to, status) 
            VALUES (?, ?, ?, ?, ?, 'Open')
        `;
        pool.query(sql, [title, category, priority, pc_number, assigned_to], (err, result) => {
            if (err) {
                console.error("❌ Insert Error:", err);
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ success: true, id: result.insertId });
        });
    });

    // 3. Resolve Ticket 
    // Captures the IT member's name (resolver) to track individual performance
    router.put('/resolve/:id', (req, res) => {
        const { id } = req.params;
        const { resolver } = req.body; 
        const sql = "UPDATE tickets SET status = 'Resolved', assigned_to = ? WHERE id = ?";
        
        pool.query(sql, [resolver, id], (err, result) => {
            if (err) {
                console.error("❌ Resolve Error:", err);
                return res.status(500).json({ error: "DB Update Failed" });
            }
            res.json({ 
                success: true, 
                message: `Ticket #${id} resolved and assigned to ${resolver}` 
            });
        });
    });

    // 4. Get Analytics for Report Page
    // Tracks System Totals, Staff Productivity, and PC-specific issues
    router.get('/analytics', (req, res) => {
        
        // Overview Stats
        const statsSql = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN status != 'Resolved' THEN 1 ELSE 0 END) as open
            FROM tickets;
        `;
        
        // Individual Performance: Tickets resolved by each IT staff member
        const perPersonSql = `
            SELECT assigned_to as name, COUNT(*) as count 
            FROM tickets 
            WHERE status = 'Resolved' AND assigned_to != 'Unassigned'
            GROUP BY assigned_to
            ORDER BY count DESC;
        `;

        // PC Frequency: Tracks how many times a specific PC appears in the incident logs
        const perPcSql = `
            SELECT pc_number, COUNT(*) as count 
            FROM tickets 
            WHERE pc_number IS NOT NULL AND pc_number != ''
            GROUP BY pc_number
            ORDER BY count DESC
            LIMIT 10;
        `;

        pool.query(statsSql, (err, overview) => {
            if (err) return res.status(500).json({ error: err.message });
            
            pool.query(perPersonSql, (err, personStats) => {
                if (err) return res.status(500).json({ error: err.message });
                
                pool.query(perPcSql, (err, pcStats) => {
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

    return router;
};