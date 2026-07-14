-- Restrict SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- handle_new_user is only called by the auth trigger; keep service_role only.

-- Recreate view as SECURITY INVOKER (Postgres 15+)
DROP VIEW IF EXISTS public.events_hourly;
CREATE VIEW public.events_hourly
WITH (security_invoker = true) AS
SELECT
  date_trunc('hour', ts) AS hour,
  name, source, country, device_type,
  count(*)::bigint AS n
FROM public.events
GROUP BY 1,2,3,4,5;
GRANT SELECT ON public.events_hourly TO service_role;

-- Admin read policy on user_roles (users already have own-row select)
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- events table has RLS enabled with no client policies by design (server-only access).
-- Silence the linter with an explicit "no client access" documentation policy.
DROP POLICY IF EXISTS "Deny all client access" ON public.events;
CREATE POLICY "Deny all client access" ON public.events
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);