import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/components/LandingPage";
import { getLanding, landingHead } from "@/lib/landing";
import { originLoader } from "@/lib/origin.functions";

const content = getLanding("sharpen-image");

export const Route = createFileRoute("/sharpen-image")({
  component: () => <LandingPage data={content} />,
  loader: originLoader,
  head: ({ loaderData }) => landingHead(loaderData?.origin, content),
});
