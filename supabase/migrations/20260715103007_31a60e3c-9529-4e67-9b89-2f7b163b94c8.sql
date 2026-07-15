
CREATE TABLE public.reliability_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  hour_bucket timestamptz NOT NULL DEFAULT date_trunc('hour', now()),
  kind text NOT NULL,
  dedup_key text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  detail text NOT NULL,
  recommendation text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivered_at timestamptz,
  delivery_status text,
  delivery_error text
);

CREATE INDEX reliability_alerts_ts_idx ON public.reliability_alerts (ts DESC);
CREATE UNIQUE INDEX reliability_alerts_dedup_idx
  ON public.reliability_alerts (kind, dedup_key, hour_bucket);

GRANT SELECT ON public.reliability_alerts TO authenticated;
GRANT ALL ON public.reliability_alerts TO service_role;

ALTER TABLE public.reliability_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read reliability alerts"
  ON public.reliability_alerts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
