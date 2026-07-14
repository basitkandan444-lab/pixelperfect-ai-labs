-- Lock down SECURITY DEFINER trigger functions so signed-in users cannot invoke them directly.
-- These are only called by triggers on auth.users; end users have no need to execute them.
REVOKE ALL ON FUNCTION public.bootstrap_first_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- has_role() is intentionally executable by authenticated users because RLS
-- policies across the schema reference it. Restrict anon and public, but
-- keep authenticated + service_role. This is the documented pattern.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;