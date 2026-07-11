import { createFileRoute } from "@tanstack/react-router";

import { jsonOk } from "@/lib/api-response";
import { BUILD_INFO, buildAgeSeconds, releaseTag } from "@/lib/build-info";

// Release intelligence: exactly which build is live. Lets a deploy be verified
// ("did my rollout actually go out?") and lets incidents be correlated with a
// specific version/commit. PII-free, safe to expose publicly.
//
// Stable URLs (immutable across renames):
//   https://project--34446754-4199-4528-b011-72bc3e10d075.lovable.app/api/public/version
//   https://project--34446754-4199-4528-b011-72bc3e10d075-dev.lovable.app/api/public/version

export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: async () =>
        jsonOk({
          version: BUILD_INFO.version,
          commit: BUILD_INFO.commit,
          release: releaseTag(),
          buildTime: BUILD_INFO.buildTime,
          buildAgeSeconds: buildAgeSeconds(),
          mode: BUILD_INFO.mode,
        }),
    },
  },
});
