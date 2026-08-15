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
            "group toast group-[.toaster]:bg-surface-low group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-modal group-[.toaster]:rounded-lg group-[.toaster]:px-5 group-[.toaster]:py-4",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-[13px]",
          actionButton:
            "group-[.toast]:bg-foreground group-[.toast]:text-background group-[.toast]:rounded-md group-[.toast]:font-bold group-[.toast]:text-xs group-[.toast]:uppercase group-[.toast]:tracking-widest",
          cancelButton:
            "group-[.toast]:bg-surface-mid group-[.toast]:text-foreground group-[.toast]:rounded-md group-[.toast]:font-bold group-[.toast]:text-xs group-[.toast]:uppercase group-[.toast]:tracking-widest",
          success: "group-[.toaster]:border-primary/20",
          error: "group-[.toaster]:border-destructive/20",
          icon: "group-[.toast]:text-primary group-[.toast]:h-4 group-[.toast]:w-4",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
