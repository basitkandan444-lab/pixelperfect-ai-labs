import { createFileRoute } from "@tanstack/react-router";

import { ContentPage, Section } from "@/components/ContentPage";
import { SITE, absoluteUrl, breadcrumbSchema } from "@/lib/site";
import { getRequestOrigin } from "@/lib/origin.functions";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  loader: async () => ({ origin: await getRequestOrigin() }),
  head: ({ loaderData }) => {
    const canonical = absoluteUrl(loaderData?.origin, "/terms");
    return {
      meta: [
        { title: `Terms of Service — ${SITE.name}` },
        {
          name: "description",
          content:
            "The terms governing your use of Pixel Perfect Pro, the free AI image enhancer and photo upscaler.",
        },
        { property: "og:title", content: `Terms of Service — ${SITE.name}` },
        {
          property: "og:description",
          content:
            "The terms governing your use of Pixel Perfect Pro, the free AI image enhancer and photo upscaler.",
        },
        { property: "og:url", content: canonical },
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbSchema(loaderData?.origin, { name: "Terms of Service", path: "/terms" }),
          ),
        },
      ],
    };
  },
});

function TermsPage() {
  return (
    <ContentPage
      title="Terms of Service"
      updated="July 9, 2026"
      intro="These terms explain the rules for using Pixel Perfect Pro, what you can expect from the service and what we ask of you in return. By using the tool you agree to them, so please read them carefully."
    >
      <Section heading="Use of the service">
        <p>
          Pixel Perfect Pro is provided free of charge for enhancing and upscaling images. You may
          use it for personal or commercial projects, as often as you like, without creating an
          account. In exchange, you agree to use it only for lawful purposes and only with images
          you own or otherwise have the right to edit.
        </p>
      </Section>
      <Section heading="Acceptable use">
        <p>To keep the service safe and available for everyone, you agree not to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Upload content that is illegal, harmful, hateful or sexually exploitative</li>
          <li>Upload images that infringe another person's copyright, trademark or privacy</li>
          <li>Attempt to disrupt, overload, probe or reverse-engineer the service</li>
          <li>Use automated scripts or bots to abuse the tool or evade usage limits</li>
        </ul>
      </Section>
      <Section heading="Your responsibilities">
        <p>
          You are solely responsible for the images you upload and for how you use the enhanced
          results. You confirm that you have the necessary rights to each image and that processing
          it does not break any law or third-party agreement. AI enhancement reconstructs plausible
          detail rather than recovering original information, so you should review results before
          using them in any context where accuracy matters, such as identification, legal or medical
          use.
        </p>
      </Section>
      <Section heading="Content ownership">
        <p>
          You retain all rights to the images you upload and to the enhanced results you download.
          We claim no ownership over your content and do not use it to build unrelated products. Our
          rights are limited to the software, branding and design of Pixel Perfect Pro itself.
        </p>
      </Section>
      <Section heading="Availability and warranty">
        <p>
          The service is provided “as is” and “as available”, without warranties of any kind. We
          work to keep it reliable, but we do not guarantee that every enhancement will meet your
          expectations, that results will be error-free, or that the service will always be
          uninterrupted or maintained indefinitely.
        </p>
      </Section>
      <Section heading="Limitation of liability">
        <p>
          To the maximum extent permitted by law, Pixel Perfect Pro and its team are not liable for
          any indirect, incidental or consequential damages — including lost data, lost profits or
          image quality outcomes — arising from your use of, or inability to use, the service.
        </p>
      </Section>
      <Section heading="Changes to these terms">
        <p>
          We may update these terms from time to time as the service evolves. When we do, we will
          update the “Last updated” date above. Continued use of the service after changes take
          effect means you accept the updated terms.
        </p>
      </Section>
      <Section heading="Contact">
        <p>
          Questions about these terms? Email us at{" "}
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
