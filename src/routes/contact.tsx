import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";

import { ContentPage } from "@/components/ContentPage";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => ({
    meta: [
      { title: `Contact — ${SITE.name}` },
      {
        name: "description",
        content:
          "Get in touch with the Pixel Perfect Pro team for support, feedback or questions about our free AI image enhancer.",
      },
      { property: "og:title", content: `Contact — ${SITE.name}` },
      { property: "og:description", content: "Contact the Pixel Perfect Pro team." },
      { property: "og:url", content: "/contact" },
    ],
    links: [{ rel: "canonical", href: "/contact" }],
  }),
});

const ContactSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(100),
  email: z.string().trim().email("Please enter a valid email").max(255),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000),
});

function ContactPage() {
  const [values, setValues] = useState({ name: "", email: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = ContactSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path[0] as string] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    const subject = encodeURIComponent(`Contact from ${parsed.data.name}`);
    const body = encodeURIComponent(`${parsed.data.message}\n\nFrom: ${parsed.data.email}`);
    window.location.href = `mailto:${SITE.email}?subject=${subject}&body=${body}`;
    toast.success("Opening your email app to send the message.");
  };

  const field =
    "w-full rounded-xl border border-input bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <ContentPage
      title="Contact us"
      intro="Have a question, found a bug, or want to share feedback? We'd love to hear from you."
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="text-sm font-medium text-foreground">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            className={field}
            placeholder="Your name"
            value={values.name}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "name-error" : undefined}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          />
          {errors.name && (
            <p id="name-error" className="text-xs text-destructive">
              {errors.name}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            className={field}
            placeholder="you@example.com"
            value={values.email}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
          />
          {errors.email && (
            <p id="email-error" className="text-xs text-destructive">
              {errors.email}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="message" className="text-sm font-medium text-foreground">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            rows={5}
            className={field}
            placeholder="How can we help?"
            value={values.message}
            aria-invalid={!!errors.message}
            aria-describedby={errors.message ? "message-error" : undefined}
            onChange={(e) => setValues((v) => ({ ...v, message: e.target.value }))}
          />
          {errors.message && (
            <p id="message-error" className="text-xs text-destructive">
              {errors.message}
            </p>
          )}
        </div>

        <div>
          <Button type="submit" variant="hero" size="lg">
            Send message
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Or email us directly at{" "}
          <a
            href={`mailto:${SITE.email}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {SITE.email}
          </a>
          .
        </p>
      </form>
    </ContentPage>
  );
}
