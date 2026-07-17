
ALTER FUNCTION public.set_investigation_bookmarks_updated_at() SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.set_investigation_bookmarks_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_investigation_bookmarks_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_investigation_bookmarks_updated_at() FROM anon;
