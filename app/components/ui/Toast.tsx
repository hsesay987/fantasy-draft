"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

export function Toast({
  message,
  onDone,
  tone = "info",
}: {
  message: string | null;
  onDone: () => void;
  tone?: "info" | "error";
}) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message, onDone]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-3 text-sm shadow-xl md:bottom-8 ${
            tone === "error"
              ? "border-accent/50 bg-accent/20 text-rose-100"
              : "border-white/10 bg-card text-foreground"
          }`}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
