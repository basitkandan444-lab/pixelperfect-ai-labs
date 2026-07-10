import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/components/LandingPage";
import { getLanding, landingHead } from "@/lib/landing";
import { getRequestOrigin } from "@/lib/origin.functions";

const content = getLanding("increase-image-resolution");

export const Route = createFileRoute("/increase-image-resolution")({
  component: () => <LandingPage data={content} />,
  loader: async () => ({ origin: await getRequestOrigin() }),
  head: ({ loaderData }) => landingHead(loaderData?.origin, content),
});
