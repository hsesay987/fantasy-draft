// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import Providers from "./providers";
import UserMenu from "./components/UserMenu";
import FeedbackWidget from "./components/FeedbackWidget";
import AdShell from "./components/AdShell";
import Script from "next/script";
import RoomStatusBanner from "./components/RoomStatusBanner";

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
    <html lang="en" className="h-full">
      {adsenseClient && (
        <Script
          id="adsense-loader"
          strategy="afterInteractive"
          data-ad-client={adsenseClient}
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
          crossOrigin="anonymous"
        />
      )}
      <body className="h-full bg-slate-950 text-slate-100">
        <Providers>
          <div className="min-h-screen flex flex-col">
            <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-4">
                <Link href="/" className="text-xl font-extrabold text-indigo-400">
                  TopPic
                </Link>
                <RoomStatusBanner />
              </div>

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

            <AdShell>{children}</AdShell>

            <FeedbackWidget />
          </div>
        </Providers>
      </body>
    </html>
  );
}

// import "./globals.css";
// import type { Metadata } from "next";
// import { AuthProvider } from "./hooks/useAuth";
// import UserMenu from "./components/UserMenu";
// import { GoogleOAuthProvider } from "@react-oauth/google";

// const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// export const metadata: Metadata = {
//   title: "TopPic",
//   description:
//     "A social game platform for drafts, quizzes, imposter games, and culture battles.",
// };

// export default function RootLayout({
//   children,
// }: {
//   children: React.ReactNode;
// }) {

//   const shell = (
//     <AuthProvider>
//       {/* App Shell */}
//       <div className="min-h-screen flex flex-col">
//         {/* Global Header (lightweight, optional per-page) */}
//         <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
//           <h1 className="text-xl font-extrabold text-indigo-400">TopPic</h1>

//           <nav className="flex gap-6 text-sm text-slate-300">
//             <a href="/draft" className="hover:text-indigo-400">
//               Drafts
//             </a>
//             <a href="/online" className="hover:text-indigo-400">
//               Online
//             </a>
//           </nav>

//           <UserMenu />
//         </header>

//         {/* Main Content */}
//         <main className="flex-1 w-full">{children}</main>
//       </div>
//     </AuthProvider>
//   );

//   return (
//     <html lang="en" className="h-full">
//       <body className="h-full bg-slate-950 text-slate-100">
//         {googleClientId ? (
//           <GoogleOAuthProvider clientId={googleClientId}>
//             {shell}
//           </GoogleOAuthProvider>
//         ) : (
//           shell
//         )}
//       </body>
//     </html>
//   );
// }
