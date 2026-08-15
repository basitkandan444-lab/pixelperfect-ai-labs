import { createServerFn } from "@tanstack/react-start";

export const getEngineeringTelemetry = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      // In a real production environment, we might read from a DB or memory store.
      // For this protocol, we read the active agent telemetry from the filesystem.
      // This file is updated by the engineering team (AI agents).
      
      // Node.js 'fs' is safe to use in server functions with nodejs_compat.
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      
      const telemetryPath = path.resolve(process.cwd(), ".lovable/agents/active.json");
      const data = await fs.readFile(telemetryPath, "utf-8");
      
      return JSON.parse(data);
    } catch (error) {
      console.error("Failed to read engineering telemetry:", error);
      return {
        status: "DEGRADED",
        error: "Telemetry source unreachable",
        timestamp: new Date().toISOString()
      };
    }
  });
