const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    // Existing Login Route
    router.post('/login', (req, res) => {
        const { username, password } = req.body;
        const sql = "SELECT username, full_name, role FROM users WHERE username = ? AND password = ?";
        
        pool.query(sql, [username, password], (err, results) => {
            if (err) {
                console.error("Login Error:", err);
                return res.status(500).json({ error: "Server error" });
            }
            if (results.length > 0) {
                res.json({ success: true, user: results[0] });
            } else {
                res.status(401).json({ success: false, message: "Invalid credentials" });
            }
        });
    });

    // NEW: Create User Route
    router.post('/create', (req, res) => {
        const { username, password, full_name, role } = req.body;

        // Check if all fields are provided
        if (!username || !password || !full_name || !role) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const sql = "INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)";
        
        pool.query(sql, [username, password, full_name, role], (err, result) => {
            if (err) {
                console.error("Database Error:", err);
                // Handle duplicate username error
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: "Username already exists" });
                }
                return res.status(500).json({ error: "Failed to create user" });
            }
            res.json({ success: true, message: "User created successfully!", id: result.insertId });
        });
    });

    return router;
};