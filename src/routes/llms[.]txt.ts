import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Derive an absolute base URL from the incoming request so page links
        // are valid absolute URLs on whatever host serves them.
        let baseUrl = "";
        try {
          baseUrl = new URL(request.url).origin;
        } catch {
          baseUrl = "";
        }

        const link = (path: string) => `${baseUrl}${path}`;

        const body = [
          `# ${SITE.name}`,
          ``,
          `> ${SITE.description}`,
          ``,
          `${SITE.name} is a free, no-signup AI image enhancer and photo upscaler that turns blurry, low-quality photos into sharp 4K and 8K images — removing blur and noise and restoring old photos directly in the browser.`,
          ``,
          `## Pages`,
          ``,
          `- [Home](${link("/")}): Upload a photo and enhance it to 4K/8K quality for free.`,
          `- [About](${link("/about")}): What Pixel Perfect Pro does and how the AI upscaler works.`,
          `- [Contact](${link("/contact")}): Get in touch with the team.`,
          `- [Privacy Policy](${link("/privacy")}): How uploaded images and data are handled.`,
          `- [Terms of Service](${link("/terms")}): Terms governing use of the service.`,
          `- [Cookie Policy](${link("/cookies")}): How cookies are used on the site.`,
          ``,
          `## Contact`,
          ``,
          `- Email: ${SITE.email}`,
          ``,
        ].join("\n");

        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
