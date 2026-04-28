require('dotenv').config();

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

// 1. Import Routes
const ticketRoutes = require('./routes/ticketRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// 2. Database Configuration
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '', // Enter your MySQL password if any
    database: 'tws_portal',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Check Connection
pool.getConnection((err, conn) => {
    if (err) console.error("❌ DB Connection Error:", err.message);
    else {
        console.log("✅ Database Connected.");
        conn.release();
    }
});

app.use('/api/tickets', ticketRoutes(pool));
app.use('/api/users', userRoutes(pool));

// 4. Start Server
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`🚀 IT Portal Backend running on port ${PORT}`);
});