"use client";

import { FormEvent, useMemo, useState } from "react";
import { Bug, Loader2, MessageCircle, Send, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "../hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type FeedbackType = "feedback" | "bug";

export default function FeedbackWidget() {
  const { token, user } = useAuth();
  const pathname = usePathname() || "";
  // Sticky action bars live at the bottom of /play pages; keep the button clear of them.
  const lifted = pathname.startsWith("/play") || pathname.startsWith("/draft/new");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("feedback");
  const [category, setCategory] = useState("idea");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  const currentUrl = useMemo(
    () => (typeof window !== "undefined" ? window.location.href : null),
    []
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus("sending");
    setError(null);

    try {
      const res = await fetch(`${API_URL}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          type,
          category,
          message: message.trim(),
          url: currentUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to send feedback.");

      setStatus("sent");
      setMessage("");
    } catch (err: any) {
      setStatus("error");
      setError(err.message);
    }
  }

  return (
    <div className={`fixed ${lifted ? "bottom-40 md:bottom-24" : "bottom-20 md:bottom-4"} right-4 z-50 flex flex-col items-end gap-3`}>
      {open && (
        <div className="w-80 rounded-2xl border border-white/10 bg-card/95 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageCircle className="h-4 w-4 text-secondary" />
              Feedback
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-muted-foreground hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setType("feedback")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 ${
                  type === "feedback"
                    ? "border-secondary/60 bg-primary/15 text-secondary"
                    : "border-white/10 bg-card text-muted-foreground hover:border-white/10"
                }`}
              >
                <MessageCircle className="h-4 w-4" />
                Idea / UX
              </button>
              <button
                type="button"
                onClick={() => setType("bug")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 ${
                  type === "bug"
                    ? "border-red-400/60 bg-red-500/10 text-red-100"
                    : "border-white/10 bg-card text-muted-foreground hover:border-white/10"
                }`}
              >
                <Bug className="h-4 w-4" />
                Problem
              </button>
            </div>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-lg border border-white/10 bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="idea">New idea</option>
                <option value="design">Design / UX</option>
                <option value="gameplay">Gameplay</option>
                <option value="bugs">Bug / issue</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Message
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={2000}
                className="rounded-lg border border-white/10 bg-background px-3 py-2 text-sm text-foreground focus:border-secondary focus:ring-0"
                placeholder="Tell us what you love, what feels off, or what broke."
              />
              <span className="text-[11px] text-muted-foreground">
                {message.length}/2000
              </span>
            </label>

            {user?.email && (
              <p className="text-[11px] text-muted-foreground">
                Signed in as <span className="text-foreground">{user.email}</span>
              </p>
            )}

            {error && (
              <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            {status === "sent" && (
              <p className="text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2">
                Thanks! We got your note.
              </p>
            )}

            <button
              type="submit"
              disabled={status === "sending" || !message.trim()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-[#8b5cf6] disabled:opacity-60"
            >
              {status === "sending" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send feedback
                </>
              )}
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => {
          setOpen((o) => !o);
          setStatus("idle");
          setError(null);
        }}
        className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-900/50 hover:bg-[#8b5cf6]"
      >
        <MessageCircle className="h-4 w-4" />
        Feedback
      </button>
    </div>
  );
}
