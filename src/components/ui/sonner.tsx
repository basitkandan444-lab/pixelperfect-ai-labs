import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          // Text always sits on the solid `background` token with `foreground`
          // text — a WCAG AA pairing — instead of sonner's `richColors` palette
          // (saturated fills with low-contrast text). Status is conveyed by the
          // tinted icon + left accent border, not by low-contrast colored text.
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-primary",
          error: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-destructive",
          icon: "group-[.toast]:text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
