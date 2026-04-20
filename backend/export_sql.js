const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'pisowifi-admin.db');
const db = new sqlite3.Database(dbPath);

function exportTableToSQL(tableName, selectSql, callback) {
    db.all(selectSql, [], (err, rows) => {
        if (err) {
            console.error(`Error reading ${tableName}:`, err);
            callback(err);
            return;
        }

        let sql = `-- Data for ${tableName}\n`;
        rows.forEach(row => {
            const columns = Object.keys(row).join(', ');
            const values = Object.values(row).map(val => {
                if (val === null) return 'NULL';
                if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                if (Buffer.isBuffer(val)) return `E'\\\\x${val.toString('hex')}'`; // For BLOB
                return val;
            }).join(', ');
            sql += `INSERT INTO ${tableName} (${columns}) VALUES (${values});\n`;
        });
        callback(null, sql);
    });
}

const tables = [
    ['admins', 'SELECT * FROM admins'],
    ['notification_settings', 'SELECT * FROM notification_settings'],
    ['client_accounts', 'SELECT * FROM client_accounts'],
    ['orders', 'SELECT * FROM orders'],
    ['referral_rewards', `SELECT rr.* FROM referral_rewards rr
                        INNER JOIN client_accounts ca1 ON rr.referrer_account_id = ca1.id
                        INNER JOIN client_accounts ca2 ON rr.referred_account_id = ca2.id
                        LEFT JOIN orders o ON rr.first_order_id = o.id
                        WHERE rr.first_order_id IS NULL OR o.id IS NOT NULL`],
    ['referral_redemptions', `SELECT rr.* FROM referral_redemptions rr
                              INNER JOIN client_accounts ca ON rr.client_account_id = ca.id`],
    ['chat_sessions', `SELECT cs.* FROM chat_sessions cs
                      LEFT JOIN orders o ON cs.order_id = o.id
                      WHERE cs.order_id IS NULL OR o.id IS NOT NULL`],
    ['chat_messages', `SELECT cm.* FROM chat_messages cm
                      INNER JOIN chat_sessions cs ON cm.session_id = cs.id`]
];

let allSQL = '';

function exportNext(index) {
    if (index >= tables.length) {
        fs.writeFileSync('migration_data.sql', allSQL);
        console.log('Exported data to migration_data.sql');
        db.close();
        return;
    }

    exportTableToSQL(tables[index][0], tables[index][1], (err, sql) => {
        if (err) {
            db.close();
            return;
        }
        allSQL += sql + '\n';
        exportNext(index + 1);
    });
}

exportNext(0);