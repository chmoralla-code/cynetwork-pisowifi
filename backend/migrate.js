const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

// SQLite setup
const dbPath = path.join(__dirname, 'pisowifi-admin.db');
const db = new sqlite3.Database(dbPath);

// PostgreSQL setup
const pgClient = new Client({
    connectionString: 'postgresql://postgres:Cy_NetWork_3212@db.bokirbsfqtqqknvrqlcv.supabase.co:5432/postgres'
});

async function migrateTable(tableName, selectSql, insertSql) {
    console.log(`Migrating ${tableName}...`);
    const rows = await new Promise((resolve, reject) => {
        db.all(selectSql, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    for (const row of rows) {
        try {
            await pgClient.query(insertSql, Object.values(row));
        } catch (err) {
            console.error(`Error inserting into ${tableName}:`, err.message);
        }
    }
    console.log(`Migrated ${rows.length} rows for ${tableName}`);
}

async function migrate() {
    try {
        await pgClient.connect();
        console.log('Connected to PostgreSQL');

        // Migrate admins
        await migrateTable(
            'admins',
            'SELECT id, username, password, email, created_at FROM admins',
            'INSERT INTO admins (id, username, password, email, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING'
        );

        // Migrate client_accounts
        await migrateTable(
            'client_accounts',
            'SELECT id, full_name, contact_number, email, password, referral_code, referred_by_code, referral_balance, referral_reward_count, created_at, updated_at FROM client_accounts',
            'INSERT INTO client_accounts (id, full_name, contact_number, email, password, referral_code, referred_by_code, referral_balance, referral_reward_count, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO NOTHING'
        );

        // Migrate referral_rewards
        await migrateTable(
            'referral_rewards',
            'SELECT id, referrer_account_id, referred_account_id, first_order_id, reward_amount, created_at FROM referral_rewards',
            'INSERT INTO referral_rewards (id, referrer_account_id, referred_account_id, first_order_id, reward_amount, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING'
        );

        // Migrate referral_redemptions
        await migrateTable(
            'referral_redemptions',
            'SELECT id, client_account_id, gross_amount, vat_amount, net_amount, gcash_name, gcash_number, status, note, created_at, updated_at FROM referral_redemptions',
            'INSERT INTO referral_redemptions (id, client_account_id, gross_amount, vat_amount, net_amount, gcash_name, gcash_number, status, note, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO NOTHING'
        );

        // Migrate chat_sessions
        await migrateTable(
            'chat_sessions',
            'SELECT id, client_id, order_id, tracking_number, customer_name, customer_contact, status, created_at, updated_at, last_message_at FROM chat_sessions',
            'INSERT INTO chat_sessions (id, client_id, order_id, tracking_number, customer_name, customer_contact, status, created_at, updated_at, last_message_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING'
        );

        // Migrate chat_messages
        await migrateTable(
            'chat_messages',
            'SELECT id, session_id, sender_type, message, read_by_admin, read_by_client, created_at FROM chat_messages',
            'INSERT INTO chat_messages (id, session_id, sender_type, message, read_by_admin, read_by_client, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING'
        );

        // Migrate notification_settings
        await migrateTable(
            'notification_settings',
            'SELECT id, telegram_enabled, telegram_bot_token, telegram_chat_id, intergram_enabled, intergram_webhook_url, notify_pending_orders, notify_ai_chats, created_at, updated_at FROM notification_settings',
            'INSERT INTO notification_settings (id, telegram_enabled, telegram_bot_token, telegram_chat_id, intergram_enabled, intergram_webhook_url, notify_pending_orders, notify_ai_chats, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING'
        );

        // Migrate orders (complex due to BLOB)
        console.log('Migrating orders...');
        const orderRows = await new Promise((resolve, reject) => {
            db.all('SELECT id, tracking_number, package_id, package_name, price, duration, full_name, contact_number, address, wifi_name, wifi_password, wifi_rate, proof_image, status, approved_by, rejection_reason, amazon_leo_sms_sent, amazon_leo_sms_sent_at, amazon_leo_sms_error, quantity, unit_price, shipping_fee, total_price, client_account_id, referral_code_used, created_at, updated_at FROM orders', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        for (const row of orderRows) {
            try {
                // Convert BLOB to bytea
                const proofImage = row.proof_image ? Buffer.from(row.proof_image) : null;
                await pgClient.query(
                    'INSERT INTO orders (id, tracking_number, package_id, package_name, price, duration, full_name, contact_number, address, wifi_name, wifi_password, wifi_rate, proof_image, status, approved_by, rejection_reason, amazon_leo_sms_sent, amazon_leo_sms_sent_at, amazon_leo_sms_error, quantity, unit_price, shipping_fee, total_price, client_account_id, referral_code_used, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27) ON CONFLICT (id) DO NOTHING',
                    [row.id, row.tracking_number, row.package_id, row.package_name, row.price, row.duration, row.full_name, row.contact_number, row.address, row.wifi_name, row.wifi_password, row.wifi_rate, proofImage, row.status, row.approved_by, row.rejection_reason, row.amazon_leo_sms_sent, row.amazon_leo_sms_sent_at, row.amazon_leo_sms_error, row.quantity, row.unit_price, row.shipping_fee, row.total_price, row.client_account_id, row.referral_code_used, row.created_at, row.updated_at]
                );
            } catch (err) {
                console.error('Error inserting order:', err.message);
            }
        }
        console.log(`Migrated ${orderRows.length} orders`);

        console.log('Migration completed successfully!');
    } catch (err) {
        console.error('Migration error:', err);
    } finally {
        await pgClient.end();
        db.close();
    }
}

migrate();