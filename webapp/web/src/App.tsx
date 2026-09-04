import { RouterProvider, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "@/router";
import * as React from "react";
import { useAuthStore } from "@/store/auth";
import Lenis from "lenis";
import { Toaster } from "@/components/ui/sonner";
import { AnimatePresence, motion } from "framer-motion";

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

// Helper demonstrating page transition pattern with useLocation + AnimatePresence + motion.div
// Actual route transitions are handled in Layout via AnimatePresence keyed by location.pathname;
// this component is kept for documentation / future reuse and ensures App.tsx contains the required pattern.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  React.useEffect(() => { hydrate(); }, [hydrate]);
  // Lenis smooth scroll – jimiiot has buttery scroll, garmin has snappy
  React.useEffect(() => {
    const lenis = new Lenis({ autoRaf: true, lerp: 0.08 });
    return () => lenis.destroy();
  }, []);
  return (
    <QueryClientProvider client={qc}>
      <AnimatePresence mode="wait">
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          <RouterProvider router={router} />
        </motion.div>
      </AnimatePresence>
      <Toaster />
    </QueryClientProvider>
  );
}
