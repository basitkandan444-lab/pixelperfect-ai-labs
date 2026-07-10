import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/components/LandingPage";
import { getLanding, landingHead } from "@/lib/landing";
import { getRequestOrigin } from "@/lib/origin.functions";

const content = getLanding("restore-old-photo");

export const Route = createFileRoute("/restore-old-photo")({
  component: () => <LandingPage data={content} />,
  loader: async () => ({ origin: await getRequestOrigin() }),
  head: ({ loaderData }) => landingHead(loaderData?.origin, content),
});
