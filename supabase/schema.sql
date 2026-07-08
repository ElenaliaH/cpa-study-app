-- Supabase 数据表：CPA Study 云同步
-- 在 Supabase SQL Editor 中执行本文件

-- 1. 创建表
CREATE TABLE IF NOT EXISTS user_app_data (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_app_data_updated_at ON user_app_data;
CREATE TRIGGER trg_user_app_data_updated_at
  BEFORE UPDATE ON user_app_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. 开启 RLS
ALTER TABLE user_app_data ENABLE ROW LEVEL SECURITY;

-- 4. RLS 策略：用户只能读写自己的数据
DROP POLICY IF EXISTS "select_own" ON user_app_data;
CREATE POLICY "select_own" ON user_app_data
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own" ON user_app_data;
CREATE POLICY "insert_own" ON user_app_data
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own" ON user_app_data;
CREATE POLICY "update_own" ON user_app_data
  FOR UPDATE USING (auth.uid() = user_id);
