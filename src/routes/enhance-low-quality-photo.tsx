import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/components/LandingPage";
import { getLanding, landingHead } from "@/lib/landing";
import { getRequestOrigin } from "@/lib/origin.functions";

const content = getLanding("enhance-low-quality-photo");

export const Route = createFileRoute("/enhance-low-quality-photo")({
  component: () => <LandingPage data={content} />,
  loader: async () => ({ origin: await getRequestOrigin() }),
  head: ({ loaderData }) => landingHead(loaderData?.origin, content),
});
