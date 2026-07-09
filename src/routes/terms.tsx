import { createFileRoute } from "@tanstack/react-router";

import { ContentPage, Section } from "@/components/ContentPage";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: `Terms of Service — ${SITE.name}` },
      {
        name: "description",
        content:
          "The terms governing your use of Pixel Perfect Pro, the free AI image enhancer and photo upscaler.",
      },
      { property: "og:title", content: `Terms of Service — ${SITE.name}` },
      { property: "og:url", content: "/terms" },
    ],
    links: [{ rel: "canonical", href: "/terms" }],
  }),
});

function TermsPage() {
  return (
    <ContentPage
      title="Terms of Service"
      updated="July 9, 2026"
      intro="By using Pixel Perfect Pro you agree to these terms. Please read them carefully."
    >
      <Section heading="Use of the service">
        <p>
          Pixel Perfect Pro is provided free of charge for enhancing and upscaling images. You agree
          to use it only for lawful purposes and only with images you own or have the right to use.
        </p>
      </Section>
      <Section heading="Acceptable use">
        <p>
          You may not upload content that is illegal, infringes on others' rights, or violates
          privacy. You may not attempt to disrupt, abuse or reverse-engineer the service.
        </p>
      </Section>
      <Section heading="Content ownership">
        <p>
          You retain all rights to the images you upload and to the enhanced results you download. We
          claim no ownership over your content.
        </p>
      </Section>
      <Section heading="Availability and warranty">
        <p>
          The service is provided “as is” without warranties of any kind. We do not guarantee that
          every enhancement will meet your expectations or that the service will be uninterrupted.
        </p>
      </Section>
      <Section heading="Limitation of liability">
        <p>
          To the maximum extent permitted by law, Pixel Perfect Pro is not liable for any indirect or
          consequential damages arising from your use of the service.
        </p>
      </Section>
      <Section heading="Changes">
        <p>
          We may update these terms from time to time. Continued use of the service after changes
          means you accept the updated terms.
        </p>
      </Section>
      <Section heading="Contact">
        <p>
          Questions? Email us at{" "}
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
