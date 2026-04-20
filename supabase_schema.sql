-- Supabase PostgreSQL Schema for CYNETWORK PISOWIFI
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Admins table
CREATE TABLE IF NOT EXISTS admins (
    id BIGSERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
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
    proof_image BYTEA,
    status TEXT DEFAULT 'pending',
    approved_by TEXT,
    rejection_reason TEXT,
    amazon_leo_sms_sent INTEGER DEFAULT 0,
    amazon_leo_sms_sent_at TIMESTAMP WITH TIME ZONE,
    amazon_leo_sms_error TEXT,
    quantity INTEGER DEFAULT 1,
    unit_price TEXT,
    shipping_fee TEXT DEFAULT '0',
    total_price TEXT,
    client_account_id BIGINT,
    referral_code_used TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Client accounts table
CREATE TABLE IF NOT EXISTS client_accounts (
    id BIGSERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    contact_number TEXT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    referral_code TEXT UNIQUE NOT NULL,
    referred_by_code TEXT,
    referral_balance INTEGER DEFAULT 0,
    referral_reward_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Client email verification codes table
CREATE TABLE IF NOT EXISTS client_email_verification_codes (
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_digest TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    consumed_at TEXT,
    verified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_client_email_codes_lookup
    ON client_email_verification_codes (email, purpose, consumed_at, created_at);

-- Referral rewards table
CREATE TABLE IF NOT EXISTS referral_rewards (
    id BIGSERIAL PRIMARY KEY,
    referrer_account_id BIGINT NOT NULL REFERENCES client_accounts(id),
    referred_account_id BIGINT UNIQUE NOT NULL REFERENCES client_accounts(id),
    first_order_id BIGINT REFERENCES orders(id),
    reward_amount INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Referral redemptions table
CREATE TABLE IF NOT EXISTS referral_redemptions (
    id BIGSERIAL PRIMARY KEY,
    client_account_id BIGINT NOT NULL REFERENCES client_accounts(id),
    gross_amount INTEGER NOT NULL,
    vat_amount INTEGER NOT NULL DEFAULT 15,
    net_amount INTEGER NOT NULL,
    gcash_name TEXT NOT NULL,
    gcash_number TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
    id BIGSERIAL PRIMARY KEY,
    client_id TEXT UNIQUE NOT NULL,
    order_id BIGINT REFERENCES orders(id),
    tracking_number TEXT,
    customer_name TEXT,
    customer_contact TEXT,
    status TEXT DEFAULT 'ai',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES chat_sessions(id),
    sender_type TEXT NOT NULL,
    message TEXT NOT NULL,
    read_by_admin INTEGER DEFAULT 0,
    read_by_client INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notification settings table
CREATE TABLE IF NOT EXISTS notification_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    telegram_enabled INTEGER DEFAULT 0,
    telegram_bot_token TEXT,
    telegram_chat_id TEXT,
    intergram_enabled INTEGER DEFAULT 0,
    intergram_webhook_url TEXT,
    notify_pending_orders INTEGER DEFAULT 1,
    notify_ai_chats INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default admin (bcrypt hash for 'admin123')
INSERT INTO admins (username, password, email) 
VALUES ('admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin@cynetwork.com')
ON CONFLICT (username) DO NOTHING;

-- Insert default notification settings
INSERT INTO notification_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;