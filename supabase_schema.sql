-- ==========================================
-- CYNETWORK PISOWIFI - SUPABASE DATABASE SCHEMA
-- ==========================================
-- Copy and paste the entire block below into your Supabase SQL Editor.
-- If tables already exist, use the ALTER TABLE statements at the bottom.

-- 1. Create orders table
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

-- 2. Create chats table
CREATE TABLE IF NOT EXISTS piso_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT REFERENCES piso_orders(order_id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create clients table (with referral columns)
CREATE TABLE IF NOT EXISTS piso_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT UNIQUE NOT NULL,
  full_name TEXT,
  email TEXT UNIQUE,
  contact_number TEXT,
  balance NUMERIC DEFAULT 0,
  referral_code TEXT UNIQUE,
  referral_balance NUMERIC DEFAULT 0,
  invite_count INTEGER DEFAULT 0,
  converted_invite_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Create harvests table (JuanFi Income)
CREATE TABLE IF NOT EXISTS piso_harvests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  note TEXT,
  harvest_date TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Enable Realtime for these tables
-- Run these one by one if they fail in a single block
ALTER PUBLICATION supabase_realtime ADD TABLE piso_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE piso_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE piso_clients;
ALTER PUBLICATION supabase_realtime ADD TABLE piso_harvests;

-- ==========================================
-- MIGRATION: Run these if tables already exist
-- ==========================================
-- Add missing referral columns to piso_clients if they don't exist
ALTER TABLE piso_clients ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE piso_clients ADD COLUMN IF NOT EXISTS referral_balance NUMERIC DEFAULT 0;
ALTER TABLE piso_clients ADD COLUMN IF NOT EXISTS invite_count INTEGER DEFAULT 0;
ALTER TABLE piso_clients ADD COLUMN IF NOT EXISTS converted_invite_count INTEGER DEFAULT 0;

-- Enable Row Level Security (RLS) - optional but recommended
-- ALTER TABLE piso_orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE piso_clients ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE piso_chats ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE piso_harvests ENABLE ROW LEVEL SECURITY;
