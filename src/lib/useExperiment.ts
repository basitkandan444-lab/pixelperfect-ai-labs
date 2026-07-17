// Client hook that resolves an experiment by key, assigns a deterministic
// variant, emits `experiment_exposure` at most once per (session, experiment),
// and returns a `trackConversion` function that emits `experiment_conversion`
// at most once per (session, experiment).
//
// Reads active experiments from the anon-readable `public.experiments` table
// (RLS: status='running'). Never blocks render — while loading, returns the
// declared control variant if any experiment definition is cached, otherwise
// returns `null`.

import { useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { assignVariant, type Variant } from "@/lib/experiments";
import { track } from "@/lib/track";

type RemoteExperiment = {
  id: string;
  key: string;
  variants: Variant[];
  status: string;
};

type Cache = {
  fetchedAt: number;
  data: Map<string, RemoteExperiment>;
};

const CACHE_TTL_MS = 60_000;
let cache: Cache | null = null;
let inflight: Promise<Map<string, RemoteExperiment>> | null = null;

function isValidVariantArray(x: unknown): x is Variant[] {
  return (
    Array.isArray(x) &&
    x.every(
      (v): v is Variant =>
        !!v && typeof v === "object" && "id" in v && typeof (v as { id: unknown }).id === "string",
    )
  );
}

async function fetchActiveExperiments(): Promise<Map<string, RemoteExperiment>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase
      .from("experiments")
      .select("id, key, variants, status")
      .eq("status", "running");
    const map = new Map<string, RemoteExperiment>();
    if (!error && Array.isArray(data)) {
      for (const row of data as { id: string; key: string; variants: unknown; status: string }[]) {
        if (!isValidVariantArray(row.variants)) continue;
        map.set(row.key, {
          id: row.id,
          key: row.key,
          variants: row.variants,
          status: row.status,
        });
      }
    }
    cache = { fetchedAt: Date.now(), data: map };
    inflight = null;
    return map;
  })();
  return inflight;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let v = sessionStorage.getItem("ppp_sid");
  if (!v) {
    v = crypto.randomUUID();
    sessionStorage.setItem("ppp_sid", v);
  }
  return v;
}

function exposureKey(exp: string) {
  return `ppp_expo_${exp}`;
}
function conversionKey(exp: string) {
  return `ppp_conv_${exp}`;
}

export type UseExperimentResult = {
  /** Assigned variant id, or null while loading / if experiment not running. */
  variant: string | null;
  /** True once the experiment definition has been loaded (or definitively absent). */
  ready: boolean;
  /** True when the experiment is running for this session. */
  active: boolean;
  /** Records a conversion for this experiment (idempotent per session). */
  trackConversion: (extra?: Record<string, unknown>) => void;
};

export function useExperiment(key: string): UseExperimentResult {
  const [remote, setRemote] = useState<RemoteExperiment | null | undefined>(undefined);
  const emittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchActiveExperiments()
      .then((map) => {
        if (cancelled) return;
        setRemote(map.get(key) ?? null);
      })
      .catch(() => {
        if (!cancelled) setRemote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const variant = useMemo(() => {
    if (!remote) return null;
    const sessionId = getSessionId();
    if (!sessionId) return null;
    return assignVariant(remote.id, sessionId, remote.variants);
  }, [remote]);

  useEffect(() => {
    if (!remote || !variant) return;
    if (emittedRef.current) return;
    try {
      const k = exposureKey(remote.id);
      if (sessionStorage.getItem(k)) {
        emittedRef.current = true;
        return;
      }
      sessionStorage.setItem(k, variant);
    } catch {
      /* private mode / disabled storage */
    }
    emittedRef.current = true;
    track({
      name: "experiment_exposure",
      metrics: { experiment_id: remote.id, experiment_key: remote.key, variant },
    });
  }, [remote, variant]);

  const trackConversion = useMemo(() => {
    return (extra?: Record<string, unknown>) => {
      if (!remote || !variant) return;
      try {
        const k = conversionKey(remote.id);
        if (sessionStorage.getItem(k)) return;
        sessionStorage.setItem(k, variant);
      } catch {
        /* ignore */
      }
      track({
        name: "experiment_conversion",
        metrics: { experiment_id: remote.id, experiment_key: remote.key, variant, ...extra },
      });
    };
  }, [remote, variant]);

  return {
    variant,
    ready: remote !== undefined,
    active: remote !== null && remote !== undefined && variant !== null,
    trackConversion,
  };
}

/** Test-only: reset the in-module cache. */
export function __resetExperimentCache() {
  cache = null;
  inflight = null;
}
