import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/components/LandingPage";
import { getLanding, landingHead } from "@/lib/landing";
import { getRequestOrigin } from "@/lib/origin.functions";

const content = getLanding("fix-blurry-photo");

export const Route = createFileRoute("/fix-blurry-photo")({
  component: () => <LandingPage data={content} />,
  loader: async () => ({ origin: await getRequestOrigin() }),
  head: ({ loaderData }) => landingHead(loaderData?.origin, content),
});
