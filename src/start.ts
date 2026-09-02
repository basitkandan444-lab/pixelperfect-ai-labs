import { createStart } from "@tanstack/react-start";
import { attachStoredAuthToken } from "@/lib/auth-token-middleware";

export const startInstance = createStart(() => ({
  functionMiddleware: [attachStoredAuthToken],
}));
