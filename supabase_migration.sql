-- DomMaster OS — Tables for Supabase
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/ryiejjywpklfloebtaev/sql/new)

-- 1. Competitor Estimate Analysis
CREATE TABLE IF NOT EXISTS public.competitor_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  source_file TEXT NOT NULL,
  items JSONB DEFAULT '[]',
  analysis JSONB DEFAULT '{}',
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.competitor_estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own analyses" ON public.competitor_estimates
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can insert analyses" ON public.competitor_estimates
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Telegram Chats
CREATE TABLE IF NOT EXISTS public.telegram_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL UNIQUE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  enabled BOOLEAN DEFAULT true,
  notifications_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage telegram chats" ON public.telegram_chats
  FOR ALL USING (auth.uid() IS NOT NULL);

-- 3. Handwriting OCR Results
CREATE TABLE IF NOT EXISTS public.handwriting_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_url TEXT NOT NULL,
  recognized_text TEXT DEFAULT '',
  confidence REAL DEFAULT 0,
  corrections JSONB DEFAULT '[]',
  status TEXT DEFAULT 'success',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.handwriting_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own ocr" ON public.handwriting_results
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can insert ocr" ON public.handwriting_results
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Local Prices (Bashkortostan)
CREATE TABLE IF NOT EXISTS public.local_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'шт',
  price REAL NOT NULL DEFAULT 0,
  region TEXT DEFAULT 'Башкортостан',
  city TEXT NOT NULL,
  source TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_local_prices_city ON public.local_prices(city);
CREATE INDEX IF NOT EXISTS idx_local_prices_category ON public.local_prices(category);

ALTER TABLE public.local_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read local prices" ON public.local_prices
  FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert prices" ON public.local_prices
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update prices" ON public.local_prices
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- 5. Projects (if not already exists)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client_name TEXT,
  address TEXT,
  status TEXT DEFAULT 'planning',
  budget REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read projects" ON public.projects
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Seed: Sample local prices for Bashkortostan
INSERT INTO public.local_prices (category, name, unit, price, city) VALUES
  ('Отделка', 'Штукатурка стен цементная', 'м²', 420, 'Салават'),
  ('Отделка', 'Штукатурка стен цементная', 'м²', 450, 'Стерлитамак'),
  ('Отделка', 'Штукатурка стен цементная', 'м²', 380, 'Ишимбай'),
  ('Отделка', 'Шпатлёвка стен', 'м²', 280, 'Салават'),
  ('Отделка', 'Шпатлёвка стен', 'м²', 300, 'Стерлитамак'),
  ('Отделка', 'Шпатлёвка стен', 'м²', 250, 'Ишимбай'),
  ('Полы', 'Стяжка пола цементная', 'м²', 550, 'Салават'),
  ('Полы', 'Стяжка пола цементная', 'м²', 580, 'Стерлитамак'),
  ('Полы', 'Стяжка пола цементная', 'м²', 500, 'Ишимбай'),
  ('Полы', 'Укладка ламината', 'м²', 380, 'Салават'),
  ('Полы', 'Укладка ламината', 'м²', 400, 'Стерлитамак'),
  ('Полы', 'Укладка ламината', 'м²', 350, 'Ишимбай'),
  ('Плитка', 'Укладка плитки напольной', 'м²', 1200, 'Салават'),
  ('Плитка', 'Укладка плитки напольной', 'м²', 1300, 'Стерлитамак'),
  ('Плитка', 'Укладка плитки напольной', 'м²', 1100, 'Ишимбай'),
  ('Сантехника', 'Установка унитаза', 'шт', 2500, 'Салават'),
  ('Сантехника', 'Установка унитаза', 'шт', 2800, 'Стерлитамак'),
  ('Сантехника', 'Установка унитаза', 'шт', 2300, 'Ишимбай'),
  ('Электрика', 'Прокладка кабеля (до 5 мм²)', 'м', 180, 'Салават'),
  ('Электрика', 'Прокладка кабеля (до 5 мм²)', 'м', 200, 'Стерлитамак'),
  ('Электрика', 'Прокладка кабеля (до 5 мм²)', 'м', 160, 'Ишимбай'),
  ('Потолок', 'Покраска потолка', 'м²', 250, 'Салават'),
  ('Потолок', 'Покраска потолка', 'м²', 270, 'Стерлитамак'),
  ('Потолок', 'Покраска потолка', 'м²', 220, 'Ишимбай'),
  ('Стены', 'Поклейка обоев', 'м²', 320, 'Салават'),
  ('Стены', 'Поклейка обоев', 'м²', 350, 'Стерлитамак'),
  ('Стены', 'Поклейка обоев', 'м²', 290, 'Ишимбай')
ON CONFLICT DO NOTHING;
