const mysql = require('mysql2/promise');

export default async function handler(req, res) {
    // Enable CORS so Lovable can talk to Vercel
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Connects using your saved Vercel environment variables
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const { action } = req.query;

        // Route 1: Fetch university data for Lovable search
        if (action === 'get_universities') {
            const [rows] = await connection.execute('SELECT * FROM universities');
            await connection.end();
            return res.status(200).json(rows);
        }

        // Route 2: Get a student's wishlist
        if (action === 'get_wishlist') {
            const { email } = req.query;
            const [rows] = await connection.execute(
                'SELECT u.* FROM universities u JOIN wishlist w ON u.id = w.uni_id WHERE w.student_email = ?',
                [email]
            );
            await connection.end();
            return res.status(200).json(rows);
        }

        // Route 3: Toggle wishlist (Add or Remove heart)
        if (req.method === 'POST' && action === 'toggle_wishlist') {
            const { email, uni_id } = req.body;
            
            // Check if it already exists
            const [existing] = await connection.execute(
                'SELECT id FROM wishlist WHERE student_email = ? AND uni_id = ?',
                [email, uni_id]
            );

            if (existing.length > 0) {
                // If it exists, remove it (unheart)
                await connection.execute('DELETE FROM wishlist WHERE student_email = ? AND uni_id = ?', [email, uni_id]);
                await connection.end();
                return res.status(200).json({ status: 'removed' });
            } else {
                // If it doesn't exist, add it (heart)
                await connection.execute('INSERT INTO wishlist (student_email, uni_id) VALUES (?, ?)', [email, uni_id]);
                await connection.end();
                return res.status(200).json({ status: 'added' });
            }
        }

        // Route 4: Handle Tawk.to Webhooks for 10-hour tracking
        if (req.method === 'POST' && action === 'webhook_chat') {
            const { event, chat } = req.body;
            const chatId = chat.id;
            const studentEmail = chat.visitor.email;

            if (event === 'chat_start') {
                await connection.execute(
                    'INSERT INTO chat_alerts (student_email, chat_id, status) VALUES (?, ?, "unattended") ON DUPLICATE KEY UPDATE status="unattended"',
                    [studentEmail, chatId]
                );
            } else if (event === 'agent_reply') {
                await connection.execute(
                    'UPDATE chat_alerts SET status = "attended" WHERE chat_id = ?',
                    [chatId]
                );
            }
            await connection.end();
            return res.status(200).json({ success: true });
        }

        await connection.end();
        return res.status(400).json({ error: 'Invalid action' });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
