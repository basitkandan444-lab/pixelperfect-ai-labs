-- Subscriptions table (source of truth for premium entitlement)
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'free',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read only their own subscription. All writes go through service role in the webhook.
CREATE POLICY "Users read own subscription"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Free-tier usage counter lives on profiles (which already exists and 1:1 maps to auth.users).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enhancements_used INTEGER NOT NULL DEFAULT 0;

-- Premium check: active subscription with an unexpired period (or null period_end).
CREATE OR REPLACE FUNCTION public.has_premium(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE user_id = _user_id
      AND status = 'active'
      AND (current_period_end IS NULL OR current_period_end > now())
  );
$$;

-- Atomic free-tier consumption. Returns TRUE if the increment was allowed
-- (user has premium OR is under the 5-image free cap), FALSE if the free cap
-- is exhausted. Called from the server after a successful enhancement.
CREATE OR REPLACE FUNCTION public.consume_free_enhancement(_user_id UUID, _free_cap INTEGER DEFAULT 5)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_premium BOOLEAN;
  used INTEGER;
BEGIN
  SELECT public.has_premium(_user_id) INTO is_premium;
  IF is_premium THEN
    RETURN TRUE;
  END IF;

  UPDATE public.profiles
     SET enhancements_used = enhancements_used + 1
   WHERE id = _user_id
     AND enhancements_used < _free_cap
  RETURNING enhancements_used INTO used;

  RETURN used IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_free_enhancement(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_free_enhancement(UUID, INTEGER) TO service_role;