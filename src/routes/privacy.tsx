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
        {
          property: "og:description",
          content:
            "How Pixel Perfect Pro handles uploaded images and data — we don't sell your data and images aren't stored permanently.",
        },
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
      intro="This page explains, in plain language, what information Pixel Perfect Pro collects, how your uploaded images are handled and the choices you have. It is maintained by the Pixel Perfect Pro team."
    >
      <Section heading="Images you upload">
        <p>
          When you upload a photo, it is used for one purpose only: to generate your enhanced
          result. The image is processed on demand and is not added to a public gallery, used to
          train unrelated systems, sold, or shared with third parties for advertising. We do not
          require an account, so an uploaded image is never tied to a personal profile.
        </p>
        <p>
          Enhanced results are returned to you for download and are not retained as a permanent
          archive. Once your request is complete, you hold the copy — we do not keep a working
          library of user photos.
        </p>
      </Section>
      <Section heading="Information we collect">
        <p>
          Because there is no login, we do not collect names, email addresses or account details
          unless you choose to email us directly. We may collect anonymous, aggregated usage
          analytics — such as page views, approximate region, browser and device type — to
          understand how the app is used and where to improve it. This information is statistical
          and is not used to identify you personally.
        </p>
      </Section>
      <Section heading="Cookies and analytics">
        <p>
          We may use privacy-friendly analytics to measure traffic and performance. These tools rely
          on a small number of cookies or similar technologies. You can control or clear them at any
          time in your browser, and disabling analytics does not stop you from enhancing images. Our{" "}
          Cookie Policy describes each category in more detail.
        </p>
      </Section>
      <Section heading="How your image is processed">
        <p>
          Image enhancement is carried out by a secure AI processing service. Your image is
          transmitted over an encrypted (HTTPS) connection solely to produce your result, and it is
          not repurposed for other uses. Transmission and processing happen only for the request you
          initiate.
        </p>
      </Section>
      <Section heading="Data security">
        <p>
          We use industry-standard encryption in transit and limit data handling to what is needed
          to deliver the service. No online service can promise absolute security, but we avoid
          storing personal data we do not need, which is the most effective way to keep it safe.
        </p>
      </Section>
      <Section heading="Children's privacy">
        <p>
          Pixel Perfect Pro is a general-purpose tool and is not directed at children under 13. We
          do not knowingly collect personal information from children. If you believe a child has
          sent us personal data, contact us and we will remove it.
        </p>
      </Section>
      <Section heading="Your choices">
        <p>
          You can use the core tool without providing any personal information. You are free to
          clear cookies, decline analytics through your browser, or contact us with questions or
          requests regarding your data at any time.
        </p>
      </Section>
      <Section heading="Changes to this policy">
        <p>
          We may update this policy as the app evolves or as regulations change. When we do, we will
          revise the “Last updated” date above. Continued use of the service after an update means
          you accept the revised policy.
        </p>
      </Section>
      <Section heading="Contact">
        <p>
          Questions about this policy or your data? Email us at{" "}
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
