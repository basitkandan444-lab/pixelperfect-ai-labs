import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

interface SitemapEntry {
  path: string;
  changefreq?: "weekly" | "monthly";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Derive an absolute base URL from the incoming request so sitemap
        // <loc> entries are valid absolute URLs on whatever host serves them.
        let baseUrl = "";
        try {
          const url = new URL(request.url);
          baseUrl = url.origin;
        } catch {
          baseUrl = "";
        }

        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/about", changefreq: "monthly", priority: "0.6" },
          { path: "/contact", changefreq: "monthly", priority: "0.5" },
          { path: "/privacy", changefreq: "monthly", priority: "0.3" },
          { path: "/terms", changefreq: "monthly", priority: "0.3" },
          { path: "/cookies", changefreq: "monthly", priority: "0.3" },
        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${baseUrl}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
