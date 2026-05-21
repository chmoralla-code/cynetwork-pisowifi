const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres.ewmbzojqbsdwtugziwkc:Baholobot12345@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres';

async function runMigration() {
  console.log('Reading FOOLPROOF_SETUP.sql...');
  const sqlPath = path.join(__dirname, 'FOOLPROOF_SETUP.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Connecting to Supabase PostgreSQL...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false } // Required for AWS/Supabase SSL connections
  });

  try {
    await client.connect();
    console.log('Connected successfully!');
    
    console.log('Executing database schema & RLS configuration (this may take a few seconds)...');
    await client.query(sql);
    console.log('Database tables, policies, and real-time triggers deployed successfully!');

    // Seed some initial packages if empty
    console.log('Checking for existing packages...');
    const pkgCheck = await client.query('SELECT count(*) FROM piso_packages');
    const count = parseInt(pkgCheck.rows[0].count, 10);
    if (count === 0) {
      console.log('Seeding default gaming packages...');
      const seedSql = `
        INSERT INTO piso_packages (id, name, price, "originalPrice", duration, description, features, popular) VALUES
        ('pkg_starter', 'Starter Package', 299, 1498, '30 Days', 'Perfect for light browsing and gaming.', '["15 Mbps Max Speed", "Single Device Support", "Active Support 24/7"]'::jsonb, false),
        ('pkg_gamer', 'Gamer Elite', 599, 1798, '60 Days', 'Optimized for lag-free mobile/PC gaming.', '["50 Mbps Max Speed", "Anti-Lag QoS Enabled", "Up to 3 Devices", "Premium Discord Role"]'::jsonb, true),
        ('pkg_enterprise', 'Enterprise Cyber', 1199, 2398, '90 Days', 'Ultimate speed and device limit for families.', '["100 Mbps Max Speed", "Prioritized Bandwidth", "Unlimited Devices", "Dedicated Static IP Option"]'::jsonb, false)
        ON CONFLICT (id) DO NOTHING;
      `;
      await client.query(seedSql);
      console.log('Default packages seeded successfully!');
    } else {
      console.log(`Found ${count} existing packages. Skipping seeding.`);
    }

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.end();
    console.log('Connection closed.');
  }
}

runMigration();
