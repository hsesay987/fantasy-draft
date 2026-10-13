// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";
import TopBar from "./components/TopBar";
import BottomNav from "./components/BottomNav";
import FeedbackWidget from "./components/FeedbackWidget";
import AdShell from "./components/AdShell";
import Script from "next/script";
import { Russo_One, Chakra_Petch } from "next/font/google";

const russo = Russo_One({ weight: "400", subsets: ["latin"], variable: "--font-russo", display: "swap" });
const chakra = Chakra_Petch({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-chakra", display: "swap" });

export const metadata: Metadata = {
  title: "TopPic",
  description:
    "A social game platform for drafts, quizzes, imposter games, and culture battles.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adsenseClient =
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "ca-pub-3005130388684291";

  return (
    <html lang="en" className={`h-full ${russo.variable} ${chakra.variable}`}>
      {adsenseClient && (
        <Script
          id="adsense-loader"
          strategy="afterInteractive"
          data-ad-client={adsenseClient}
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
          crossOrigin="anonymous"
        />
      )}
      <body className="h-full">
        <Providers>
          <div className="min-h-screen flex flex-col">
            <TopBar />

            <div className="flex-1 pb-20 md:pb-0">
              <AdShell>{children}</AdShell>
            </div>
            <BottomNav />

            <FeedbackWidget />
          </div>
        </Providers>
      </body>
    </html>
  );
}
