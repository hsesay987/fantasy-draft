// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { AuthProvider } from "./hooks/useAuth";
import UserMenu from "./components/UserMenu";

export const metadata: Metadata = {
  title: "GameFilter",
  description:
    "A social game platform for drafts, quizzes, imposter games, and culture battles.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-slate-950 text-slate-100">
        <AuthProvider>
          {/* App Shell */}
          <div className="min-h-screen flex flex-col">
            {/* Global Header (lightweight, optional per-page) */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h1 className="text-xl font-extrabold text-indigo-400">
                GameFilter
              </h1>

              <nav className="flex gap-6 text-sm text-slate-300">
                <a href="/draft" className="hover:text-indigo-400">
                  Drafts
                </a>
                <a href="/online" className="hover:text-indigo-400">
                  Online
                </a>
              </nav>

              <UserMenu />
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
