import { createFileRoute } from "@tanstack/react-router";

import { ContentPage, Section } from "@/components/ContentPage";
import { SITE, absoluteUrl } from "@/lib/site";
import { getRequestOrigin } from "@/lib/origin.functions";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  loader: async () => ({ origin: await getRequestOrigin() }),
  head: ({ loaderData }) => {
    const canonical = absoluteUrl(loaderData?.origin, "/about");
    return {
      meta: [
        { title: `About — ${SITE.name}` },
        {
          name: "description",
          content:
            "Learn about Pixel Perfect Pro, the free AI image enhancer that upscales and restores photos to 4K and 8K quality with no signup.",
        },
        { property: "og:title", content: `About — ${SITE.name}` },
        {
          property: "og:description",
          content: "The free AI photo enhancer and upscaler behind Pixel Perfect Pro.",
        },
        { property: "og:url", content: canonical },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
});

function AboutPage() {
  return (
    <ContentPage
      title="About Pixel Perfect Pro"
      intro="Pixel Perfect Pro is a free, AI-powered image enhancer built to make high-quality photo upscaling accessible to everyone."
    >
      <Section heading="Our mission">
        <p>
          We believe everyone should be able to rescue a blurry memory or breathe new life into a
          low-resolution photo — without expensive software or a steep learning curve. Pixel Perfect
          Pro uses an AI super-resolution engine to sharpen, denoise and upscale images to 4K and 8K
          quality in seconds.
        </p>
      </Section>
      <Section heading="What you can do">
        <ul className="list-disc space-y-1 pl-5">
          <li>Enhance low-quality and blurry images</li>
          <li>Upscale photos to 4K and 8K resolution</li>
          <li>Remove noise, blur and compression artifacts</li>
          <li>Restore old or damaged photos</li>
          <li>Improve clarity and detail without altering the original subject</li>
        </ul>
      </Section>
      <Section heading="Always free">
        <p>
          Pixel Perfect Pro is completely free to use. There are no subscriptions, no hidden fees and
          no account required. Just upload, enhance and download.
        </p>
      </Section>
    </ContentPage>
  );
}
