
-- Investigation Workspace: admin-owned bookmarks and saved workspaces.
-- Append-only audit lives on public.events (name = 'investigation_*').

CREATE TABLE public.investigation_bookmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  reason TEXT,
  risk TEXT,
  category TEXT,
  folder TEXT,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  linked_alerts TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  linked_incidents TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  pinned BOOLEAN NOT NULL DEFAULT false,
  favorite BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investigation_bookmarks TO authenticated;
GRANT ALL ON public.investigation_bookmarks TO service_role;
ALTER TABLE public.investigation_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all investigation bookmarks"
  ON public.investigation_bookmarks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert their investigation bookmarks"
  ON public.investigation_bookmarks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update their investigation bookmarks"
  ON public.investigation_bookmarks FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete their investigation bookmarks"
  ON public.investigation_bookmarks FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_investigation_bookmarks_user ON public.investigation_bookmarks(user_id);
CREATE INDEX idx_investigation_bookmarks_session ON public.investigation_bookmarks(session_id);
CREATE INDEX idx_investigation_bookmarks_status ON public.investigation_bookmarks(status);
CREATE INDEX idx_investigation_bookmarks_tags ON public.investigation_bookmarks USING GIN(tags);
CREATE INDEX idx_investigation_bookmarks_created ON public.investigation_bookmarks(created_at DESC);

CREATE OR REPLACE FUNCTION public.set_investigation_bookmarks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_investigation_bookmarks_updated_at
  BEFORE UPDATE ON public.investigation_bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.set_investigation_bookmarks_updated_at();

REVOKE EXECUTE ON FUNCTION public.set_investigation_bookmarks_updated_at() FROM PUBLIC, authenticated, anon;

-- Saved investigation workspaces (filters, sort, columns, comparisons, pins).
CREATE TABLE public.investigation_workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  shared BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investigation_workspaces TO authenticated;
GRANT ALL ON public.investigation_workspaces TO service_role;
ALTER TABLE public.investigation_workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read workspaces owned or shared"
  ON public.investigation_workspaces FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND (user_id = auth.uid() OR shared = true));

CREATE POLICY "Admins insert their workspaces"
  ON public.investigation_workspaces FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update their workspaces"
  ON public.investigation_workspaces FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete their workspaces"
  ON public.investigation_workspaces FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_investigation_workspaces_user ON public.investigation_workspaces(user_id);
CREATE INDEX idx_investigation_workspaces_updated ON public.investigation_workspaces(updated_at DESC);

CREATE TRIGGER trg_investigation_workspaces_updated_at
  BEFORE UPDATE ON public.investigation_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_investigation_bookmarks_updated_at();
