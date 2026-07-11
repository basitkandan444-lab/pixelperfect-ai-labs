import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/components/LandingPage";
import { getLanding, landingHead } from "@/lib/landing";
import { originLoader } from "@/lib/origin.functions";

const content = getLanding("image-upscaler");

export const Route = createFileRoute("/image-upscaler")({
  component: () => <LandingPage data={content} />,
  loader: originLoader,
  head: ({ loaderData }) => landingHead(loaderData?.origin, content),
});
