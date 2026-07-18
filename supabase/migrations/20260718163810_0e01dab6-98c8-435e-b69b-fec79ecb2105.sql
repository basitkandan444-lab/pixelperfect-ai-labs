
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS seq integer,
  ADD COLUMN IF NOT EXISTS client_ts timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS events_event_id_uidx ON public.events(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_session_seq_idx ON public.events(session_id, seq) WHERE seq IS NOT NULL;
