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

CREATE TABLE IF NOT EXISTS piso_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT REFERENCES piso_orders(order_id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS piso_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT UNIQUE NOT NULL,
  full_name TEXT,
  email TEXT UNIQUE,
  contact_number TEXT,
  balance NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS piso_harvests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  note TEXT,
  harvest_date TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
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
END $$;

-- 4. ENABLE RLS (Row Level Security)
ALTER TABLE piso_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE piso_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE piso_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE piso_harvests ENABLE ROW LEVEL SECURITY;

-- 5. CREATE POLICIES (Allow all access for now to ensure site works)
-- Note: You can tighten these later.
CREATE POLICY "Enable all for all" ON piso_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON piso_chats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON piso_clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON piso_harvests FOR ALL USING (true) WITH CHECK (true);
