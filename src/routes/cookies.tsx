import { createFileRoute } from "@tanstack/react-router";

import { ContentPage, Section } from "@/components/ContentPage";
import { SITE, absoluteUrl } from "@/lib/site";
import { getRequestOrigin } from "@/lib/origin.functions";

export const Route = createFileRoute("/cookies")({
  component: CookiePage,
  loader: async () => ({ origin: await getRequestOrigin() }),
  head: ({ loaderData }) => {
    const canonical = absoluteUrl(loaderData?.origin, "/cookies");
    return {
      meta: [
        { title: `Cookie Policy — ${SITE.name}` },
        {
          name: "description",
          content:
            "How Pixel Perfect Pro uses cookies and similar technologies for analytics and to improve your experience.",
        },
        { property: "og:title", content: `Cookie Policy — ${SITE.name}` },
        { property: "og:url", content: canonical },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
});

function CookiePage() {
  return (
    <ContentPage
      title="Cookie Policy"
      updated="July 9, 2026"
      intro="This policy explains how Pixel Perfect Pro uses cookies and similar technologies."
    >
      <Section heading="What cookies are">
        <p>
          Cookies are small text files stored on your device that help websites function and
          understand how they are used.
        </p>
      </Section>
      <Section heading="How we use cookies">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-foreground">Essential:</strong> required for the app to work,
            such as remembering your preferences during a session.
          </li>
          <li>
            <strong className="text-foreground">Analytics:</strong> anonymous measurement of traffic
            and performance so we can improve the app.
          </li>
        </ul>
      </Section>
      <Section heading="Managing cookies">
        <p>
          You can control or delete cookies through your browser settings. Disabling analytics
          cookies will not affect your ability to enhance images.
        </p>
      </Section>
      <Section heading="Contact">
        <p>
          Questions about our use of cookies? Email us at{" "}
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
