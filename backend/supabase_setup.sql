-- Schema for Supabase (PostgreSQL)

-- 1. Tables
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  cpf TEXT UNIQUE,
  role TEXT CHECK (role IN ('driver', 'admin')) DEFAULT 'driver',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS service_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  os_number TEXT UNIQUE NOT NULL,
  driver_id UUID REFERENCES profiles(id),
  plate TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  status TEXT CHECK (status IN ('ABERTA', 'EM_COLETA', 'EM_ROTA', 'FECHADA', 'CANCELADA')) DEFAULT 'ABERTA',
  admin_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS os_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  os_id UUID REFERENCES service_orders(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('COLETA', 'ENTREGA')),
  photo_url TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION NOT NULL,
  local_time TIMESTAMP WITH TIME ZONE NOT NULL,
  server_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  observation TEXT,
  device_info JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  os_id UUID REFERENCES service_orders(id),
  actor_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. RLS Policies

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Service Orders
ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can do everything on OS" ON service_orders FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Drivers can view assigned OS" ON service_orders FOR SELECT USING (
  driver_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Drivers can update status of assigned OS" ON service_orders FOR UPDATE USING (
  driver_id = auth.uid()
);

-- OS Events
ALTER TABLE os_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all events" ON os_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Drivers can view events of assigned OS" ON os_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM service_orders WHERE id = os_id AND driver_id = auth.uid())
);
CREATE POLICY "Drivers can insert events for assigned OS" ON os_events FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM service_orders WHERE id = os_id AND driver_id = auth.uid())
);

-- 3. Storage Policies (Bucket: 'os-photos')
-- Policy: Authenticated users can upload
-- Policy: Owners or Admins can view
