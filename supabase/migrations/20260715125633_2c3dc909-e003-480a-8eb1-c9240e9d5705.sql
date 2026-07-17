
CREATE TYPE public.experiment_status AS ENUM ('draft', 'running', 'paused', 'archived');

CREATE TABLE public.experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status public.experiment_status NOT NULL DEFAULT 'draft',
  variants jsonb NOT NULL,
  goal_event text NOT NULL DEFAULT 'experiment_conversion',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz,
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX experiments_status_idx ON public.experiments (status);

GRANT SELECT ON public.experiments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.experiments TO authenticated;
GRANT ALL ON public.experiments TO service_role;

ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads running experiments"
  ON public.experiments FOR SELECT
  TO anon, authenticated
  USING (status = 'running');

CREATE POLICY "Admins read all experiments"
  ON public.experiments FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert experiments"
  ON public.experiments FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update experiments"
  ON public.experiments FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete experiments"
  ON public.experiments FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.validate_experiment_variants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n int;
  controls int;
  distinct_ids int;
BEGIN
  IF jsonb_typeof(NEW.variants) <> 'array' THEN
    RAISE EXCEPTION 'variants must be a JSON array';
  END IF;
  SELECT count(*) INTO n FROM jsonb_array_elements(NEW.variants);
  IF n < 2 THEN
    RAISE EXCEPTION 'experiment must have at least 2 variants (got %)', n;
  END IF;
  SELECT count(*) INTO controls
    FROM jsonb_array_elements(NEW.variants) v
    WHERE (v->>'is_control')::boolean IS TRUE;
  IF controls <> 1 THEN
    RAISE EXCEPTION 'exactly one variant must have is_control=true (got %)', controls;
  END IF;
  SELECT count(DISTINCT v->>'id') INTO distinct_ids
    FROM jsonb_array_elements(NEW.variants) v;
  IF distinct_ids <> n THEN
    RAISE EXCEPTION 'variant ids must be unique';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER experiments_validate_variants
  BEFORE INSERT OR UPDATE ON public.experiments
  FOR EACH ROW EXECUTE FUNCTION public.validate_experiment_variants();
