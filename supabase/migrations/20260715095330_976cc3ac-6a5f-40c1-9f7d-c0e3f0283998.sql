
CREATE TABLE IF NOT EXISTS public.telemetry_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  deployment text NOT NULL DEFAULT 'operational',
  requests integer NOT NULL DEFAULT 0,
  success integer NOT NULL DEFAULT 0,
  failure integer NOT NULL DEFAULT 0,
  success_rate numeric(6,4) NOT NULL DEFAULT 1,
  avg_ms integer NOT NULL DEFAULT 0,
  p95_ms integer NOT NULL DEFAULT 0,
  lcp_p75 numeric(10,2) NOT NULL DEFAULT 0,
  cls_p75 numeric(6,4) NOT NULL DEFAULT 0,
  inp_p75 numeric(10,2) NOT NULL DEFAULT 0,
  fcp_p75 numeric(10,2) NOT NULL DEFAULT 0,
  ttfb_p75 numeric(10,2) NOT NULL DEFAULT 0,
  samples integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS telemetry_snapshots_ts_idx
  ON public.telemetry_snapshots (ts DESC);

GRANT SELECT ON public.telemetry_snapshots TO authenticated;
GRANT ALL    ON public.telemetry_snapshots TO service_role;

ALTER TABLE public.telemetry_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read telemetry snapshots" ON public.telemetry_snapshots;
CREATE POLICY "Admins can read telemetry snapshots"
  ON public.telemetry_snapshots
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
