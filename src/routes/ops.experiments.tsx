import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteExperiment,
  listExperiments,
  updateExperimentStatus,
  upsertExperiment,
  type ExperimentRow,
} from "@/lib/experiments.functions";

export const Route = createFileRoute("/ops/experiments")({
  head: () => ({
    meta: [{ title: "Experiments — Ops" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({
        to: "/auth",
        search: {
          next: "/ops/experiments",
        },
      });
    }
  },
  component: ExperimentsAdmin,
});

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  running: "default",
  paused: "secondary",
  archived: "outline",
  draft: "outline",
};

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function ExperimentsAdmin() {
  const qc = useQueryClient();
  const list = useServerFn(listExperiments);
  const upsert = useServerFn(upsertExperiment);
  const setStatus = useServerFn(updateExperimentStatus);
  const del = useServerFn(deleteExperiment);

  const query = useQuery({
    queryKey: ["ops", "experiments"],
    queryFn: async () => {
      const res = await list();
      return res.experiments;
    },
    retry: false,
  });

  const upsertMut = useMutation({
    mutationFn: async (input: NewExperimentInput) => upsert({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "experiments"] }),
  });
  const statusMut = useMutation({
    mutationFn: async (input: {
      id: string;
      status: "draft" | "running" | "paused" | "archived";
    }) => setStatus({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "experiments"] }),
  });
  const delMut = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "experiments"] }),
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Experiments</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A/B tests. Only running experiments are served to clients. Exactly one variant per
        experiment must be marked as the control.
      </p>

      <NewExperimentForm
        submitting={upsertMut.isPending}
        error={upsertMut.error instanceof Error ? upsertMut.error.message : null}
        onSubmit={(v) => upsertMut.mutate(v)}
      />

      <section className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold">All experiments</h2>
        {query.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {query.error && (
          <p className="text-sm text-destructive">
            Failed to load — you must be signed in as an admin.
          </p>
        )}
        {query.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No experiments defined yet.</p>
        )}
        <ul className="space-y-3">
          {query.data?.map((exp: ExperimentRow) => (
            <li key={exp.id}>
              <ExperimentRowCard
                exp={exp}
                onSetStatus={(status) => statusMut.mutate({ id: exp.id, status })}
                onDelete={() => {
                  if (confirm(`Delete experiment "${exp.key}"? This cannot be undone.`)) {
                    delMut.mutate(exp.id);
                  }
                }}
                statusPending={statusMut.isPending}
                deletePending={delMut.isPending}
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function ExperimentRowCard({
  exp,
  onSetStatus,
  onDelete,
  statusPending,
  deletePending,
}: {
  exp: ExperimentRow;
  onSetStatus: (s: "running" | "paused" | "archived" | "draft") => void;
  onDelete: () => void;
  statusPending: boolean;
  deletePending: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <span className="font-mono text-sm">{exp.key}</span>
            <Badge variant={STATUS_COLORS[exp.status] ?? "outline"}>{exp.status}</Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">{exp.name}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {exp.status !== "running" && (
            <Button size="sm" onClick={() => onSetStatus("running")} disabled={statusPending}>
              Start
            </Button>
          )}
          {exp.status === "running" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onSetStatus("paused")}
              disabled={statusPending}
            >
              Pause (kill switch)
            </Button>
          )}
          {exp.status !== "archived" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSetStatus("archived")}
              disabled={statusPending}
            >
              Archive
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={onDelete} disabled={deletePending}>
            Delete
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-sm">
        {exp.description && <p className="mb-2 text-muted-foreground">{exp.description}</p>}
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 pr-4">Variant</th>
              <th className="py-1 pr-4">Weight</th>
              <th className="py-1">Role</th>
            </tr>
          </thead>
          <tbody>
            {exp.variants.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="py-1 pr-4 font-mono">{v.id}</td>
                <td className="py-1 pr-4">{v.weight ?? 1}</td>
                <td className="py-1">{v.is_control ? "control" : "variant"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted-foreground">
          Goal event: <span className="font-mono">{exp.goal_event}</span>
        </p>
      </CardContent>
    </Card>
  );
}

type NewExperimentInput = {
  key: string;
  name: string;
  description: string;
  goal_event: string;
  variants: Array<{ id: string; weight?: number; is_control?: boolean }>;
};

function NewExperimentForm({
  onSubmit,
  submitting,
  error,
}: {
  onSubmit: (v: NewExperimentInput) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goalEvent, setGoalEvent] = useState("experiment_conversion");
  const [variantsText, setVariantsText] = useState("control:1:control\nvariant_a:1");

  function parseVariants(): NewExperimentInput["variants"] | { error: string } {
    const out: NewExperimentInput["variants"] = [];
    const lines = variantsText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      const [id, weightStr, role] = line.split(":").map((s) => s.trim());
      if (!id) return { error: `bad line: ${line}` };
      const weight = weightStr ? Number(weightStr) : 1;
      if (!Number.isFinite(weight) || weight <= 0) return { error: `bad weight in: ${line}` };
      out.push({ id, weight, is_control: role === "control" });
    }
    if (out.length < 2) return { error: "need at least 2 variants" };
    if (out.filter((v) => v.is_control).length !== 1)
      return { error: "exactly one variant must have role=control" };
    return out;
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Create or update experiment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="key" className="text-sm font-medium">
              Key (unique)
            </label>
            <input
              id="key"
              className={inputCls}
              value={key}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKey(e.target.value)}
              placeholder="hero_headline_v1"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-medium">
              Name
            </label>
            <input
              id="name"
              className={inputCls}
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="Hero headline test"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="desc" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="desc"
            className={inputCls}
            value={description}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
            rows={2}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="goal" className="text-sm font-medium">
            Goal event
          </label>
          <input
            id="goal"
            className={inputCls}
            value={goalEvent}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGoalEvent(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="variants" className="text-sm font-medium">
            Variants — one per line as <span className="font-mono">id:weight:role</span> (role=
            <span className="font-mono">control</span> for exactly one)
          </label>
          <textarea
            id="variants"
            className={`${inputCls} font-mono text-xs`}
            value={variantsText}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setVariantsText(e.target.value)
            }
            rows={4}
          />
        </div>
        {error && <p className="text-sm text-destructive">Error: {error}</p>}
        <Button
          disabled={submitting}
          onClick={() => {
            const parsed = parseVariants();
            if ("error" in parsed) {
              alert(parsed.error);
              return;
            }
            onSubmit({ key, name, description, goal_event: goalEvent, variants: parsed });
          }}
        >
          Save (upsert)
        </Button>
      </CardContent>
    </Card>
  );
}
