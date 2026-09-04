import { Toaster as SonnerToaster } from "sonner";

/**
 * Mount once in App.tsx (or Layout) — every toast.success / toast.error / toast.info
 * uses the same UI.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "border border-border shadow-lg",
        },
      }}
    />
  );
}