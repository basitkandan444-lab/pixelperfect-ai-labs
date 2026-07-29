REVOKE EXECUTE ON FUNCTION public.has_premium(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_free_enhancement(uuid, integer) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_premium(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_free_enhancement(uuid, integer) TO authenticated, service_role;