CREATE OR REPLACE FUNCTION public.has_premium(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.role() = 'service_role' THEN EXISTS (
      SELECT 1
      FROM public.subscriptions
      WHERE user_id = _user_id
        AND status IN ('active', 'trialing')
        AND (current_period_end IS NULL OR current_period_end > now())
    )
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE FUNCTION public.consume_free_enhancement(_user_id UUID, _free_cap INTEGER DEFAULT 5)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  is_premium BOOLEAN;
  used INTEGER;
  effective_cap CONSTANT INTEGER := 5;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE user_id = auth.uid()
      AND status IN ('active', 'trialing')
      AND (current_period_end IS NULL OR current_period_end > now())
  ) INTO is_premium;

  IF is_premium THEN
    RETURN TRUE;
  END IF;

  UPDATE public.profiles
     SET enhancements_used = enhancements_used + 1
   WHERE id = auth.uid()
     AND enhancements_used < effective_cap
  RETURNING enhancements_used INTO used;

  RETURN used IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.has_premium(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_free_enhancement(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_premium(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_free_enhancement(UUID, INTEGER) TO authenticated, service_role;