import { createFileRoute } from "@tanstack/react-router";

import { ContentPage, Section } from "@/components/ContentPage";
import { SITE, absoluteUrl, breadcrumbSchema } from "@/lib/site";
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
        {
          property: "og:description",
          content:
            "How Pixel Perfect Pro uses cookies and similar technologies for analytics and to improve your experience.",
        },
        { property: "og:url", content: canonical },
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbSchema(loaderData?.origin, { name: "Cookie Policy", path: "/cookies" }),
          ),
        },
      ],
    };
  },
});

function CookiePage() {
  return (
    <ContentPage
      title="Cookie Policy"
      updated="July 9, 2026"
      intro="This policy explains what cookies are, how Pixel Perfect Pro uses them and similar technologies, and how you can stay in control of them."
    >
      <Section heading="What cookies are">
        <p>
          Cookies are small text files that a website stores on your device. They help a site
          function correctly, remember short-lived preferences and understand — in aggregate — how
          visitors use it. Similar technologies such as local storage and pixels can serve the same
          purposes. Most cookies are harmless and expire on their own after a set period.
        </p>
      </Section>
      <Section heading="How we use cookies">
        <p>
          Pixel Perfect Pro keeps its use of cookies deliberately minimal. We rely on two broad
          categories:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong className="text-foreground">Essential:</strong> required for the app to work,
            such as remembering your choices during a single session. These cannot be switched off
            without affecting core functionality.
          </li>
          <li>
            <strong className="text-foreground">Analytics:</strong> anonymous, aggregated
            measurement of traffic and performance so we can see which features are useful and where
            to improve. These do not identify you personally.
          </li>
        </ul>
        <p className="mt-2">
          We do not use advertising or cross-site tracking cookies, and we do not sell any
          information collected through cookies.
        </p>
      </Section>
      <Section heading="Third-party cookies">
        <p>
          Some cookies may be set by the analytics provider we use to measure site performance.
          These third parties process the data only on our behalf and for the purpose of reporting
          usage statistics, not for their own advertising.
        </p>
      </Section>
      <Section heading="Managing cookies">
        <p>
          You are always in control. Every major browser lets you view, block or delete cookies
          through its settings, and you can browse in a private or incognito window to limit them.
          Disabling analytics cookies will not affect your ability to upload, enhance or download
          images — the core tool works without them.
        </p>
      </Section>
      <Section heading="Updates to this policy">
        <p>
          If our use of cookies changes, we will update this page and revise the “Last updated” date
          above. We recommend reviewing it occasionally to stay informed.
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
