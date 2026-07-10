import { createFileRoute } from "@tanstack/react-router";

import { ContentPage, Section } from "@/components/ContentPage";
import { SITE, absoluteUrl, breadcrumbSchema } from "@/lib/site";
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
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbSchema(loaderData?.origin, { name: "About", path: "/about" }),
          ),
        },
      ],
    };
  },
});

function AboutPage() {
  return (
    <ContentPage
      title="About Pixel Perfect Pro"
      intro="Pixel Perfect Pro is a free, AI-powered image enhancer built to make high-quality photo upscaling accessible to everyone — no software, no signup and no cost."
    >
      <Section heading="Our mission">
        <p>
          We believe everyone should be able to rescue a blurry memory or breathe new life into a
          low-resolution photo — without expensive software or a steep learning curve. Traditional
          photo editing tools demand time, skill and often a paid subscription. Pixel Perfect Pro
          removes those barriers with an AI super-resolution engine that sharpens, denoises and
          upscales images to 4K and 8K quality in seconds, directly in your browser.
        </p>
      </Section>
      <Section heading="What Pixel Perfect Pro does">
        <p>
          The tool analyses your image and reconstructs fine detail that low resolution, heavy
          compression or motion blur have degraded. Rather than simply stretching pixels, the AI
          predicts the texture and edges a higher-quality version of your photo would contain, then
          rebuilds them. The result is a cleaner, crisper image at a much larger resolution.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Enhance low-quality and blurry images</li>
          <li>Upscale photos to 4K and 8K resolution</li>
          <li>Remove noise, blur and compression artifacts</li>
          <li>Restore old, faded or scanned photographs</li>
          <li>Improve clarity and detail without altering the original subject</li>
        </ul>
      </Section>
      <Section heading="Who it is for">
        <p>
          Pixel Perfect Pro is for anyone with a photo that could look better: families digitising
          old prints, sellers who want sharper product listings, students and creators improving
          screenshots and graphics, and photographers salvaging shots that were slightly soft or
          shot in low light. Because there is nothing to install and no learning curve, it suits
          complete beginners as much as experienced editors who need a quick upscale.
        </p>
      </Section>
      <Section heading="How it works">
        <p>
          Upload a JPG, PNG or WEBP file up to 15MB, choose your target resolution, and the AI
          processes the image and returns a high-resolution PNG you can download instantly.
          Everything happens on demand — there are no queues to sign up for and no files left
          sitting on a server. If you want a step-by-step walkthrough and real before-and-after
          examples, the homepage explains the full workflow in detail.
        </p>
      </Section>
      <Section heading="Privacy first">
        <p>
          Your images belong to you. Uploads are used only to generate your enhanced result for that
          single request and are not stored permanently, sold or shared for advertising. You can
          read the specifics in our Privacy Policy, and you never have to create an account to use
          the tool.
        </p>
      </Section>
      <Section heading="Always free">
        <p>
          Pixel Perfect Pro is completely free to use. There are no subscriptions, no hidden fees,
          no watermarks and no account required. Just upload, enhance and download — as often as you
          like.
        </p>
      </Section>
    </ContentPage>
  );
}
