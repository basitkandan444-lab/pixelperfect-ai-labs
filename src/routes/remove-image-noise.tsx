import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/components/LandingPage";
import { getLanding, landingHead } from "@/lib/landing";
import { getRequestOrigin } from "@/lib/origin.functions";

const content = getLanding("remove-image-noise");

export const Route = createFileRoute("/remove-image-noise")({
  component: () => <LandingPage data={content} />,
  loader: async () => ({ origin: await getRequestOrigin() }),
  head: ({ loaderData }) => landingHead(loaderData?.origin, content),
});
