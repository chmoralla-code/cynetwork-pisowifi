-- ==========================================
-- CYNETWORK PISOWIFI - FOOLPROOF DATABASE SETUP
-- ==========================================

-- 1. ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CREATE TABLES (Idempotent)
CREATE TABLE IF NOT EXISTS piso_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT UNIQUE NOT NULL,
  tracking_number TEXT,
  full_name TEXT,
  package TEXT,
  package_name TEXT,
  price NUMERIC,
  unit_price NUMERIC,
  total_price NUMERIC,
  shipping_fee NUMERIC DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  duration TEXT,
  contact_number TEXT,
  full_address TEXT,
  contact_email TEXT,
  wifi_name TEXT,
  wifi_password TEXT,
  wifi_rate TEXT,
  rates JSONB DEFAULT '{}'::jsonb,
  proof TEXT,
  proof_image TEXT,
  ref_number TEXT,
  status TEXT DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS piso_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT UNIQUE NOT NULL,
  full_name TEXT,
  email TEXT UNIQUE,
  contact_number TEXT,
  balance NUMERIC DEFAULT 0,
  referral_code TEXT,
  referral_balance NUMERIC DEFAULT 0,
  invite_count INTEGER DEFAULT 0,
  converted_invite_count INTEGER DEFAULT 0,
  referred_by TEXT,
  is_banned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Idempotent column additions in case the table was already created without them
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='piso_clients' AND column_name='referral_code') THEN
        ALTER TABLE piso_clients ADD COLUMN referral_code TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='piso_clients' AND column_name='referral_balance') THEN
        ALTER TABLE piso_clients ADD COLUMN referral_balance NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='piso_clients' AND column_name='invite_count') THEN
        ALTER TABLE piso_clients ADD COLUMN invite_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='piso_clients' AND column_name='converted_invite_count') THEN
        ALTER TABLE piso_clients ADD COLUMN converted_invite_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='piso_clients' AND column_name='referred_by') THEN
        ALTER TABLE piso_clients ADD COLUMN referred_by TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='piso_clients' AND column_name='is_banned') THEN
        ALTER TABLE piso_clients ADD COLUMN is_banned BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 2b. CREATE INDEXES FOR REFERRALS AND CLUSTERING
CREATE INDEX IF NOT EXISTS idx_piso_clients_referred_by ON piso_clients(referred_by);
CREATE INDEX IF NOT EXISTS idx_piso_clients_referral_code ON piso_clients(referral_code);



CREATE TABLE IF NOT EXISTS piso_harvests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  note TEXT,
  harvest_date TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS piso_packages (
  id TEXT PRIMARY KEY,
  name TEXT,
  price NUMERIC,
  "originalPrice" NUMERIC,
  duration TEXT,
  description TEXT,
  features JSONB,
  media_url TEXT,
  popular BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS piso_chat_sessions (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  order_id TEXT,
  tracking_number TEXT,
  customer_name TEXT,
  customer_contact TEXT,
  status TEXT DEFAULT 'ai',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS piso_chats (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT REFERENCES piso_chat_sessions(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES piso_orders(order_id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS piso_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT
);

-- 3. ENABLE REALTIME SAFELY
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'piso_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE piso_orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'piso_chats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE piso_chats;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'piso_clients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE piso_clients;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'piso_harvests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE piso_harvests;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'piso_chat_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE piso_chat_sessions;
  END IF;
END $$;

-- 4. ENABLE RLS (Row Level Security)
ALTER TABLE piso_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE piso_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE piso_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE piso_harvests ENABLE ROW LEVEL SECURITY;
ALTER TABLE piso_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE piso_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE piso_settings ENABLE ROW LEVEL SECURITY;

-- 5. CREATE POLICIES (Allow all access for now to ensure site works)
-- Note: You can tighten these later.
DO $$
BEGIN
    DROP POLICY IF EXISTS "Enable all for all" ON piso_orders;
    DROP POLICY IF EXISTS "Enable all for all" ON piso_chats;
    DROP POLICY IF EXISTS "Enable all for all" ON piso_clients;
    DROP POLICY IF EXISTS "Enable all for all" ON piso_harvests;
    DROP POLICY IF EXISTS "Enable all for all" ON piso_chat_sessions;
    DROP POLICY IF EXISTS "Enable all for all" ON piso_packages;
    DROP POLICY IF EXISTS "Enable all for all" ON piso_settings;
END $$;

CREATE POLICY "Enable all for all" ON piso_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON piso_chats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON piso_clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON piso_harvests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON piso_chat_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON piso_packages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON piso_settings FOR ALL USING (true) WITH CHECK (true);
