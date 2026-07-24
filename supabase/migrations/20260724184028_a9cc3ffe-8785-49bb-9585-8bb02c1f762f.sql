DROP INDEX IF EXISTS public.events_event_id_uidx;
ALTER TABLE public.events ADD CONSTRAINT events_event_id_key UNIQUE (event_id);