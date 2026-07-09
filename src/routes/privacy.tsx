import { createFileRoute } from "@tanstack/react-router";

import { ContentPage, Section } from "@/components/ContentPage";
import { SITE, absoluteUrl, breadcrumbSchema } from "@/lib/site";
import { getRequestOrigin } from "@/lib/origin.functions";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  loader: async () => ({ origin: await getRequestOrigin() }),
  head: ({ loaderData }) => {
    const canonical = absoluteUrl(loaderData?.origin, "/privacy");
    return {
      meta: [
        { title: `Privacy Policy — ${SITE.name}` },
        {
          name: "description",
          content:
            "How Pixel Perfect Pro handles your uploaded images and data. We do not sell your data and images are not stored permanently.",
        },
        { property: "og:title", content: `Privacy Policy — ${SITE.name}` },
        { property: "og:url", content: canonical },
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbSchema(loaderData?.origin, { name: "Privacy Policy", path: "/privacy" }),
          ),
        },
      ],
    };
  },
});

function PrivacyPage() {
  return (
    <ContentPage
      title="Privacy Policy"
      updated="July 9, 2026"
      intro="This page explains what information Pixel Perfect Pro collects and how it is used. This policy is maintained by the Pixel Perfect Pro team."
    >
      <Section heading="Images you upload">
        <p>
          Images you upload are used solely to generate your enhanced result. They are processed on
          demand and are not stored permanently, sold, or shared with third parties for advertising.
        </p>
      </Section>
      <Section heading="Information we collect">
        <p>
          We may collect anonymous, aggregated usage analytics (such as page views, device type and
          general location) to understand how the app is used and improve it. This data does not
          identify you personally.
        </p>
      </Section>
      <Section heading="Cookies and analytics">
        <p>
          We may use privacy-friendly analytics tools to measure traffic and performance. See our{" "}
          Cookie Policy for details on the cookies that may be set.
        </p>
      </Section>
      <Section heading="Third-party processing">
        <p>
          Image enhancement is performed via a secure AI processing service. Your image is
          transmitted over an encrypted connection only for the purpose of producing your result.
        </p>
      </Section>
      <Section heading="Your choices">
        <p>
          You can use most of the app without providing any personal information. You may contact us
          at any time to ask questions about your data.
        </p>
      </Section>
      <Section heading="Contact">
        <p>
          Questions about this policy? Email us at{" "}
          <a
            href={`mailto:${SITE.email}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {SITE.email}
          </a>
          .
        </p>
      </Section>
    </ContentPage>
  );
}
