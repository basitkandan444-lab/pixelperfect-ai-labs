-- ============ Roles ============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============ Profiles ============
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles readable by owner" ON public.profiles;
CREATE POLICY "Profiles readable by owner" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "Profiles updatable by owner" ON public.profiles;
CREATE POLICY "Profiles updatable by owner" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "Profiles insertable by owner" ON public.profiles;
CREATE POLICY "Profiles insertable by owner" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (new.id,
          COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
          new.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ Events (privacy-preserving, no PII) ============
CREATE TABLE IF NOT EXISTS public.events (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL,
  name text NOT NULL,
  path text,
  referrer_host text,
  source text,        -- direct|organic|referral|social|paid|email|unknown
  medium text,
  campaign text,
  country text,       -- 2-letter code
  region text,
  city text,
  timezone text,
  language text,
  device_type text,   -- desktop|mobile|tablet
  os text,
  browser text,
  screen_w int,
  screen_h int,
  duration_ms int,
  bytes int,
  ok boolean,
  error_code text,
  ua_kind text        -- likely_human|needs_review|suspicious
);

-- No user_id column: events are anonymous by design.
CREATE INDEX IF NOT EXISTS events_ts_idx ON public.events (ts DESC);
CREATE INDEX IF NOT EXISTS events_name_ts_idx ON public.events (name, ts DESC);
CREATE INDEX IF NOT EXISTS events_session_idx ON public.events (session_id, ts);
CREATE INDEX IF NOT EXISTS events_country_idx ON public.events (country);
CREATE INDEX IF NOT EXISTS events_source_idx ON public.events (source);

GRANT ALL ON public.events TO service_role;
-- authenticated admins read via server functions using service_role; no direct client access
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No client access" ON public.events;
-- Deny-by-default: no client policies at all. Reads happen server-side via service role;
-- writes happen through the /api/public/events ingestion route with service role.

-- Aggregation view for the dashboard
CREATE OR REPLACE VIEW public.events_hourly AS
SELECT
  date_trunc('hour', ts) AS hour,
  name,
  source,
  country,
  device_type,
  count(*)::bigint AS n
FROM public.events
GROUP BY 1,2,3,4,5;

GRANT SELECT ON public.events_hourly TO service_role;