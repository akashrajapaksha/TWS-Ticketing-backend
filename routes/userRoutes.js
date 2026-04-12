const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    router.post('/login', (req, res) => {
        const { username, password } = req.body;

        const sql = "SELECT username, full_name, role FROM users WHERE username = ? AND password = ?";
        
        pool.query(sql, [username, password], (err, results) => {
            if (err) {
                console.error("Login Error:", err);
                return res.status(500).json({ error: "Server error" });
            }

            if (results.length > 0) {
                // Returns the specific user object (either an IT person or the 'staff' user)
                res.json({
                    success: true,
                    user: results[0] 
                });
            } else {
                res.status(401).json({ success: false, message: "Invalid credentials" });
            }
        });
    });

    return router;
};