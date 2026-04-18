// =====================================================
// CYNETWORK PISOWIFI - ADMIN BACKEND SERVER
// =====================================================

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const SECRET_KEY = process.env.JWT_SECRET || 'cynetwork-pisowifi-secret-2026';
const adminPublicDir = path.join(__dirname, 'public');
const clientPublicDir = path.join(__dirname, '..', 'website');
const uploadedPackageImagesDir = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(adminPublicDir, 'package-images');

const defaultPackageImages = {
    1: 'assets/images/package1.png',
    2: 'assets/images/package2.png',
    3: 'assets/images/package3.png'
};
const CHAT_SESSION_STATUSES = ['ai', 'live', 'closed'];

function ensureUploadedPackageImagesDir() {
    if (!fs.existsSync(uploadedPackageImagesDir)) {
        fs.mkdirSync(uploadedPackageImagesDir, { recursive: true });
    }
}

function getUploadedPackageImagePath(packageId) {
    if (!fs.existsSync(uploadedPackageImagesDir)) {
        return null;
    }

    const matchedFile = fs
        .readdirSync(uploadedPackageImagesDir)
        .find((fileName) => fileName.startsWith(`package${packageId}.`));

    return matchedFile ? path.join(uploadedPackageImagesDir, matchedFile) : null;
}

function buildTrackingNumber(orderId, createdAt = new Date()) {
    const dateObj = new Date(createdAt);
    const safeDate = Number.isNaN(dateObj.getTime()) ? new Date() : dateObj;
    const year = safeDate.getFullYear();
    const month = String(safeDate.getMonth() + 1).padStart(2, '0');
    const day = String(safeDate.getDate()).padStart(2, '0');
    const paddedOrderId = String(orderId).padStart(6, '0');
    return `CYN-${year}${month}${day}-${paddedOrderId}`;
}

function toChatSessionPayload(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        clientId: row.client_id,
        orderId: row.order_id,
        trackingNumber: row.tracking_number,
        customerName: row.customer_name,
        customerContact: row.customer_contact,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastMessageAt: row.last_message_at,
        lastMessage: row.last_message,
        lastSender: row.last_sender,
        unreadCount: Number(row.unread_count || 0)
    };
}

function toChatMessagePayload(row) {
    return {
        id: row.id,
        sessionId: row.session_id,
        senderType: row.sender_type,
        message: row.message,
        createdAt: row.created_at,
        readByAdmin: Boolean(row.read_by_admin),
        readByClient: Boolean(row.read_by_client)
    };
}

function getOptionalAdminAuth(req) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return null;
    }

    try {
        return jwt.verify(token, SECRET_KEY);
    } catch (error) {
        return null;
    }
}

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use('/admin', express.static(adminPublicDir));
app.use(express.static(clientPublicDir));

// Serve admin dashboard at /admin route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(adminPublicDir, 'index.html'));
});

// Serve client website from root
app.get('/', (req, res) => {
    res.sendFile(path.join(clientPublicDir, 'index.html'));
});

// =====================================================
// DATABASE SETUP
// =====================================================

const dbPath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(__dirname, 'pisowifi-admin.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Database error:', err);
    else console.log(`Connected to SQLite database at: ${dbPath}`);
});

// Create tables
db.serialize(() => {
    // Admin users table
    db.run(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Orders table
    db.run(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tracking_number TEXT,
            package_id INTEGER NOT NULL,
            package_name TEXT NOT NULL,
            price TEXT NOT NULL,
            duration TEXT NOT NULL,
            full_name TEXT NOT NULL,
            contact_number TEXT NOT NULL,
            address TEXT NOT NULL,
            wifi_name TEXT NOT NULL,
            wifi_password TEXT NOT NULL,
            wifi_rate TEXT NOT NULL,
            proof_image LONGBLOB,
            status TEXT DEFAULT 'pending',
            approved_by TEXT,
            rejection_reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT UNIQUE NOT NULL,
            order_id INTEGER,
            tracking_number TEXT,
            customer_name TEXT,
            customer_contact TEXT,
            status TEXT DEFAULT 'ai',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            sender_type TEXT NOT NULL,
            message TEXT NOT NULL,
            read_by_admin INTEGER DEFAULT 0,
            read_by_client INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
        )
    `);

    db.run(`ALTER TABLE orders ADD COLUMN tracking_number TEXT`, (err) => {
        if (err && !String(err.message || '').includes('duplicate column name')) {
            console.error('Failed adding tracking_number column:', err.message);
        }
    });

    // Backfill old orders with deterministic tracking numbers.
    db.run(`
        UPDATE orders
        SET tracking_number = 'CYN-' || strftime('%Y%m%d', COALESCE(created_at, CURRENT_TIMESTAMP)) || '-' || substr('000000' || id, -6)
        WHERE tracking_number IS NULL OR TRIM(tracking_number) = ''
    `);
});

// Create default admin if not exists
const adminUsername = 'admin';
const adminPassword = 'admin123';

bcrypt.hash(adminPassword, 10, (err, hash) => {
    if (err) return console.error('Hash error:', err);
    
    db.get('SELECT id FROM admins WHERE username = ?', [adminUsername], (err, row) => {
        if (!row) {
            db.run(
                'INSERT INTO admins (username, password, email) VALUES (?, ?, ?)',
                [adminUsername, hash, 'admin@cynetwork.com'],
                (err) => {
                    if (!err) console.log('Default admin created - Username: admin, Password: admin123');
                }
            );
        }
    });
});

// =====================================================
// AUTHENTICATION MIDDLEWARE
// =====================================================

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        req.adminId = decoded.id;
        req.adminUsername = decoded.username;
        next();
    });
};

// =====================================================
// AUTHENTICATION ROUTES
// =====================================================

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    db.get('SELECT id, username, password FROM admins WHERE username = ?', [username], (err, row) => {
        if (err || !row) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        bcrypt.compare(password, row.password, (err, isMatch) => {
            if (err || !isMatch) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }
            
            const token = jwt.sign({ id: row.id, username: row.username }, SECRET_KEY, {
                expiresIn: '24h'
            });
            
            res.json({ token, username: row.username });
        });
    });
});

// =====================================================
// ORDER ROUTES
// =====================================================

// Get all orders
app.get('/api/orders', verifyToken, (req, res) => {
    db.all(
        `SELECT id, tracking_number, package_name, price, full_name, contact_number, status, created_at 
         FROM orders ORDER BY created_at DESC`,
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(rows || []);
        }
    );
});

// Get order details
app.get('/api/orders/:id', verifyToken, (req, res) => {
    const { id } = req.params;
    
    db.get(
        'SELECT * FROM orders WHERE id = ?',
        [id],
        (err, row) => {
            if (err || !row) {
                return res.status(404).json({ error: 'Order not found' });
            }
            
            // Convert BLOB to base64 for proof image
            if (row.proof_image) {
                row.proof_image = 'data:image/jpeg;base64,' + Buffer.from(row.proof_image).toString('base64');
            }
            
            res.json(row);
        }
    );
});

// Approve order
app.post('/api/orders/:id/approve', verifyToken, (req, res) => {
    const { id } = req.params;
    
    db.run(
        `UPDATE orders SET status = 'delivery', approved_by = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [req.adminUsername, id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ success: true, message: 'Order approved and set for delivery' });
        }
    );
});

// Reject order
app.post('/api/orders/:id/reject', verifyToken, (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!reason) {
        return res.status(400).json({ error: 'Rejection reason required' });
    }
    
    db.run(
        `UPDATE orders SET status = 'rejected', rejection_reason = ?, 
         approved_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [reason, req.adminUsername, id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ success: true, message: 'Order rejected' });
        }
    );
});

// Update order status
app.post('/api/orders/:id/status', verifyToken, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'approved', 'delivery', 'rejected', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    
    db.run(
        `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ success: true, message: 'Order status updated' });
        }
    );
});

// =====================================================
// ORDER SUBMISSION FROM WEBSITE
// =====================================================

app.post('/api/submit-order', (req, res) => {
    const { packageId, packageName, price, duration, fullName, contactNumber, address, wifiName, wifiPassword, wifiRate, proofImage } = req.body;
    
    // Validate required fields
    if (!packageId || !fullName || !contactNumber || !address || !wifiName || !wifiPassword) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    let proofBuffer = null;
    
    // Convert base64 proof image to buffer
    if (proofImage) {
        try {
            const base64Data = proofImage.replace(/^data:image\/\w+;base64,/, '');
            proofBuffer = Buffer.from(base64Data, 'base64');
        } catch (err) {
            console.error('Error converting image:', err);
        }
    }
    
    db.run(
        `INSERT INTO orders (package_id, package_name, price, duration, full_name, contact_number, 
                           address, wifi_name, wifi_password, wifi_rate, proof_image, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [packageId, packageName, price, duration, fullName, contactNumber, address, wifiName, wifiPassword, wifiRate, proofBuffer],
        function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Failed to save order' });
            }

            const orderId = this.lastID;
            const trackingNumber = buildTrackingNumber(orderId, new Date());

            db.run(
                `UPDATE orders SET tracking_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [trackingNumber, orderId],
                (updateErr) => {
                    if (updateErr) {
                        console.error('Tracking update error:', updateErr);
                        return res.status(500).json({ error: 'Failed to generate tracking number' });
                    }

                    res.json({
                        success: true,
                        orderId,
                        trackingNumber,
                        status: 'pending',
                        message: 'Order submitted successfully'
                    });
                }
            );
        }
    );
});

// Public order tracking (for client website)
app.get('/api/track-order/:id', (req, res) => {
    const rawLookup = String(req.params.id || '').trim();

    if (!rawLookup) {
        return res.status(400).json({ error: 'Order ID or tracking number is required' });
    }

    const normalizedLookup = rawLookup.toUpperCase();
    const isNumericOrderId = /^\d+$/.test(normalizedLookup);
    const query = isNumericOrderId
        ? `SELECT id, tracking_number, package_name, status, rejection_reason, created_at, updated_at
           FROM orders WHERE id = ? OR tracking_number = ? ORDER BY id DESC LIMIT 1`
        : `SELECT id, tracking_number, package_name, status, rejection_reason, created_at, updated_at
           FROM orders WHERE tracking_number = ? LIMIT 1`;
    const params = isNumericOrderId ? [normalizedLookup, normalizedLookup] : [normalizedLookup];

    db.get(query, params, (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (!row) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const trackingNumber = row.tracking_number || buildTrackingNumber(row.id, row.created_at);
        if (!row.tracking_number) {
            db.run(
                `UPDATE orders SET tracking_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [trackingNumber, row.id]
            );
        }

        res.json({
            orderId: row.id,
            trackingNumber,
            packageName: row.package_name,
            status: row.status,
            rejectionReason: row.rejection_reason,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        });
    });
});

// =====================================================
// LIVE SUPPORT CHAT ROUTES
// =====================================================

app.post('/api/chat/session', (req, res) => {
    const { clientId, orderId, trackingNumber, customerName, customerContact } = req.body;

    if (!clientId || typeof clientId !== 'string' || clientId.trim().length < 5) {
        return res.status(400).json({ error: 'Valid clientId is required' });
    }

    const normalizedClientId = clientId.trim();
    const normalizedTracking = trackingNumber ? String(trackingNumber).trim().toUpperCase() : null;
    const normalizedOrderId = orderId && /^\d+$/.test(String(orderId)) ? parseInt(orderId, 10) : null;

    db.get(
        `SELECT * FROM chat_sessions WHERE client_id = ?`,
        [normalizedClientId],
        (err, existingSession) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (!existingSession) {
                db.run(
                    `INSERT INTO chat_sessions (client_id, order_id, tracking_number, customer_name, customer_contact, status)
                     VALUES (?, ?, ?, ?, ?, 'ai')`,
                    [
                        normalizedClientId,
                        normalizedOrderId,
                        normalizedTracking,
                        customerName || null,
                        customerContact || null
                    ],
                    function(insertErr) {
                        if (insertErr) {
                            return res.status(500).json({ error: 'Failed to create chat session' });
                        }

                        db.get(
                            `SELECT * FROM chat_sessions WHERE id = ?`,
                            [this.lastID],
                            (getErr, createdSession) => {
                                if (getErr || !createdSession) {
                                    return res.status(500).json({ error: 'Failed to load chat session' });
                                }
                                res.json({ success: true, session: toChatSessionPayload(createdSession) });
                            }
                        );
                    }
                );
                return;
            }

            const nextOrderId = normalizedOrderId || existingSession.order_id || null;
            const nextTracking = normalizedTracking || existingSession.tracking_number || null;
            const nextCustomerName = customerName || existingSession.customer_name || null;
            const nextCustomerContact = customerContact || existingSession.customer_contact || null;

            db.run(
                `UPDATE chat_sessions
                 SET order_id = ?, tracking_number = ?, customer_name = ?, customer_contact = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [nextOrderId, nextTracking, nextCustomerName, nextCustomerContact, existingSession.id],
                (updateErr) => {
                    if (updateErr) {
                        return res.status(500).json({ error: 'Failed to update chat session' });
                    }

                    db.get(
                        `SELECT * FROM chat_sessions WHERE id = ?`,
                        [existingSession.id],
                        (getErr, updatedSession) => {
                            if (getErr || !updatedSession) {
                                return res.status(500).json({ error: 'Failed to load chat session' });
                            }
                            res.json({ success: true, session: toChatSessionPayload(updatedSession) });
                        }
                    );
                }
            );
        }
    );
});

app.post('/api/chat/live-support-request', (req, res) => {
    const { sessionId, clientId } = req.body;

    if (!sessionId || !clientId) {
        return res.status(400).json({ error: 'sessionId and clientId are required' });
    }

    db.get(
        `SELECT * FROM chat_sessions WHERE id = ?`,
        [sessionId],
        (err, session) => {
            if (err || !session) {
                return res.status(404).json({ error: 'Chat session not found' });
            }

            if (session.client_id !== clientId) {
                return res.status(403).json({ error: 'Unauthorized chat session access' });
            }

            db.run(
                `UPDATE chat_sessions SET status = 'live', updated_at = CURRENT_TIMESTAMP, last_message_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [sessionId],
                (updateErr) => {
                    if (updateErr) {
                        return res.status(500).json({ error: 'Failed to request live support' });
                    }

                    db.run(
                        `INSERT INTO chat_messages (session_id, sender_type, message, read_by_admin, read_by_client)
                         VALUES (?, 'system', ?, 0, 1)`,
                        [sessionId, 'Client requested live customer support.'],
                        (messageErr) => {
                            if (messageErr) {
                                return res.status(500).json({ error: 'Failed to add live support request message' });
                            }

                            res.json({ success: true, status: 'live' });
                        }
                    );
                }
            );
        }
    );
});

app.post('/api/chat/messages', (req, res) => {
    const { sessionId, clientId, senderType, message } = req.body;

    if (!sessionId || !clientId || !message) {
        return res.status(400).json({ error: 'sessionId, clientId, and message are required' });
    }

    if (!['client', 'ai'].includes(senderType)) {
        return res.status(400).json({ error: 'Invalid sender type' });
    }

    const trimmedMessage = String(message).trim();
    if (!trimmedMessage) {
        return res.status(400).json({ error: 'Message cannot be empty' });
    }

    db.get(
        `SELECT * FROM chat_sessions WHERE id = ?`,
        [sessionId],
        (sessionErr, session) => {
            if (sessionErr || !session) {
                return res.status(404).json({ error: 'Chat session not found' });
            }

            if (session.client_id !== clientId) {
                return res.status(403).json({ error: 'Unauthorized chat session access' });
            }

            const readByAdmin = senderType === 'client' ? 0 : 1;
            const readByClient = 1;

            db.run(
                `INSERT INTO chat_messages (session_id, sender_type, message, read_by_admin, read_by_client)
                 VALUES (?, ?, ?, ?, ?)`,
                [sessionId, senderType, trimmedMessage, readByAdmin, readByClient],
                function(insertErr) {
                    if (insertErr) {
                        return res.status(500).json({ error: 'Failed to save chat message' });
                    }

                    db.run(
                        `UPDATE chat_sessions
                         SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [sessionId]
                    );

                    db.get(
                        `SELECT * FROM chat_messages WHERE id = ?`,
                        [this.lastID],
                        (getErr, createdMessage) => {
                            if (getErr || !createdMessage) {
                                return res.status(500).json({ error: 'Failed to load chat message' });
                            }

                            res.json({ success: true, message: toChatMessagePayload(createdMessage) });
                        }
                    );
                }
            );
        }
    );
});

app.get('/api/chat/messages/:sessionId', (req, res) => {
    const sessionId = parseInt(req.params.sessionId, 10);
    const afterId = parseInt(req.query.afterId || '0', 10);
    const clientId = req.query.clientId ? String(req.query.clientId) : '';
    const shouldMarkRead = String(req.query.markRead || '1') !== '0';
    const adminAuth = getOptionalAdminAuth(req);

    if (!sessionId) {
        return res.status(400).json({ error: 'Invalid session ID' });
    }

    db.get(
        `SELECT * FROM chat_sessions WHERE id = ?`,
        [sessionId],
        (sessionErr, session) => {
            if (sessionErr || !session) {
                return res.status(404).json({ error: 'Chat session not found' });
            }

            if (!adminAuth && session.client_id !== clientId) {
                return res.status(403).json({ error: 'Unauthorized chat session access' });
            }

            db.all(
                `SELECT * FROM chat_messages WHERE session_id = ? AND id > ? ORDER BY id ASC`,
                [sessionId, afterId],
                (messagesErr, rows) => {
                    if (messagesErr) {
                        return res.status(500).json({ error: 'Failed to load chat messages' });
                    }

                    if (shouldMarkRead) {
                        if (adminAuth) {
                            db.run(
                                `UPDATE chat_messages SET read_by_admin = 1
                                 WHERE session_id = ? AND sender_type = 'client' AND read_by_admin = 0`,
                                [sessionId]
                            );
                        } else {
                            db.run(
                                `UPDATE chat_messages SET read_by_client = 1
                                 WHERE session_id = ? AND sender_type = 'admin' AND read_by_client = 0`,
                                [sessionId]
                            );
                        }
                    }

                    res.json({
                        success: true,
                        session: toChatSessionPayload(session),
                        messages: (rows || []).map(toChatMessagePayload)
                    });
                }
            );
        }
    );
});

app.get('/api/chat/sessions', verifyToken, (req, res) => {
    db.all(
        `SELECT
            s.*,
            (SELECT message FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) AS last_message,
            (SELECT sender_type FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) AS last_sender,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id AND m.sender_type = 'client' AND m.read_by_admin = 0) AS unread_count
         FROM chat_sessions s
         ORDER BY unread_count DESC, s.last_message_at DESC`,
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to load chat sessions' });
            }

            res.json({
                success: true,
                sessions: (rows || []).map(toChatSessionPayload)
            });
        }
    );
});

app.get('/api/chat/unread-count', verifyToken, (req, res) => {
    db.get(
        `SELECT COUNT(*) AS unread_count
         FROM chat_messages
         WHERE sender_type = 'client' AND read_by_admin = 0`,
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to load unread count' });
            }

            res.json({ success: true, unreadCount: Number(row?.unread_count || 0) });
        }
    );
});

app.post('/api/chat/sessions/:id/reply', verifyToken, (req, res) => {
    const sessionId = parseInt(req.params.id, 10);
    const message = String(req.body.message || '').trim();

    if (!sessionId) {
        return res.status(400).json({ error: 'Invalid session ID' });
    }

    if (!message) {
        return res.status(400).json({ error: 'Reply message is required' });
    }

    db.get(
        `SELECT * FROM chat_sessions WHERE id = ?`,
        [sessionId],
        (sessionErr, session) => {
            if (sessionErr || !session) {
                return res.status(404).json({ error: 'Chat session not found' });
            }

            db.run(
                `INSERT INTO chat_messages (session_id, sender_type, message, read_by_admin, read_by_client)
                 VALUES (?, 'admin', ?, 1, 0)`,
                [sessionId, message],
                function(insertErr) {
                    if (insertErr) {
                        return res.status(500).json({ error: 'Failed to send reply' });
                    }

                    db.run(
                        `UPDATE chat_sessions
                         SET status = 'live', last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [sessionId],
                        (updateErr) => {
                            if (updateErr) {
                                return res.status(500).json({ error: 'Failed to update chat session' });
                            }

                            db.get(
                                `SELECT * FROM chat_messages WHERE id = ?`,
                                [this.lastID],
                                (getErr, createdMessage) => {
                                    if (getErr || !createdMessage) {
                                        return res.status(500).json({ error: 'Failed to load reply message' });
                                    }

                                    res.json({
                                        success: true,
                                        message: toChatMessagePayload(createdMessage)
                                    });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

app.post('/api/chat/sessions/:id/status', verifyToken, (req, res) => {
    const sessionId = parseInt(req.params.id, 10);
    const status = String(req.body.status || '').toLowerCase();

    if (!sessionId) {
        return res.status(400).json({ error: 'Invalid session ID' });
    }

    if (!CHAT_SESSION_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid chat status' });
    }

    db.run(
        `UPDATE chat_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, sessionId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to update chat status' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Chat session not found' });
            }

            res.json({ success: true, status });
        }
    );
});

// =====================================================
// ADMIN DASHBOARD STATS
// =====================================================

app.get('/api/stats', verifyToken, (req, res) => {
    db.all(
        `SELECT 
            (SELECT COUNT(*) FROM orders) as total_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'approved') as approved_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'delivery') as delivery_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'rejected') as rejected_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'completed') as completed_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'cancelled') as cancelled_orders`,
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(rows[0] || {});
        }
    );
});

// =====================================================
// IMAGE MANAGEMENT
// =====================================================

app.post('/api/images/upload', verifyToken, (req, res) => {
    const { packageId, image } = req.body;
    
    if (!packageId || !image) {
        return res.status(400).json({ error: 'Missing package ID or image' });
    }
    
    // Validate package ID
    if (![1, 2, 3].includes(parseInt(packageId))) {
        return res.status(400).json({ error: 'Invalid package ID' });
    }
    
    try {
        const mimeMatch = image.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/);
        if (!mimeMatch) {
            return res.status(400).json({ error: 'Invalid image format' });
        }

        let extension = mimeMatch[1].toLowerCase();
        if (extension === 'jpeg') {
            extension = 'jpg';
        }

        const allowedExtensions = ['png', 'jpg', 'webp'];
        if (!allowedExtensions.includes(extension)) {
            extension = 'png';
        }

        // Convert base64 to buffer
        const base64Data = image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        ensureUploadedPackageImagesDir();

        // Remove any old uploaded image for this package before saving the new one.
        fs.readdirSync(uploadedPackageImagesDir)
            .filter((fileName) => fileName.startsWith(`package${packageId}.`))
            .forEach((fileName) => {
                fs.unlinkSync(path.join(uploadedPackageImagesDir, fileName));
            });

        const imagePath = path.join(uploadedPackageImagesDir, `package${packageId}.${extension}`);
        
        fs.writeFileSync(imagePath, imageBuffer);
        
        res.json({
            success: true,
            message: 'Image uploaded successfully',
            path: `/api/images/package/${packageId}`
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

// Serve package images for both admin and client website
app.get('/api/images/package/:packageId', (req, res) => {
    const packageId = parseInt(req.params.packageId, 10);
    if (![1, 2, 3].includes(packageId)) {
        return res.status(400).json({ error: 'Invalid package ID' });
    }

    const uploadedImagePath = getUploadedPackageImagePath(packageId);
    if (uploadedImagePath && fs.existsSync(uploadedImagePath)) {
        return res.sendFile(uploadedImagePath);
    }

    const fallbackRelativePath = defaultPackageImages[packageId];
    const fallbackAbsolutePath = path.join(clientPublicDir, fallbackRelativePath);
    if (fs.existsSync(fallbackAbsolutePath)) {
        return res.sendFile(fallbackAbsolutePath);
    }

    return res.status(404).json({ error: 'Image not found' });
});

// Backward-compatible static image route
app.get('/package-images/:filename', (req, res) => {
    const imagePath = path.join(uploadedPackageImagesDir, req.params.filename);
    if (fs.existsSync(imagePath)) {
        res.sendFile(imagePath);
    } else {
        res.status(404).json({ error: 'Image not found' });
    }
});

app.get('/health', (req, res) => {
    res.status(200).json({
        ok: true,
        service: 'cynetwork-pisowifi-backend',
        time: new Date().toISOString()
    });
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log(`
    ========================================
    CYNETWORK PISOWIFI Admin Backend
    ========================================
    Server running on port: ${PORT}
    Client Website: / 
    Admin Dashboard: /admin
    Health Check: /health
    Environment: ${process.env.NODE_ENV || 'development'}
    
    Default Credentials:
    Username: admin
    Password: admin123
    
    API Endpoints:
    POST   /api/login
    GET    /api/orders
    GET    /api/orders/:id
    POST   /api/orders/:id/approve
    POST   /api/orders/:id/reject
    POST   /api/orders/:id/status
    POST   /api/submit-order
    GET    /api/track-order/:id
    POST   /api/chat/session
    POST   /api/chat/live-support-request
    POST   /api/chat/messages
    GET    /api/chat/messages/:sessionId
    GET    /api/chat/sessions
    GET    /api/chat/unread-count
    POST   /api/chat/sessions/:id/reply
    POST   /api/chat/sessions/:id/status
    GET    /api/stats
    GET    /api/images/package/:packageId
    POST   /api/images/upload
    ========================================
    `);
});
