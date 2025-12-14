// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";
import UserMenu from "./components/UserMenu";
import AdSlot from "./components/AdSlot";
import FeedbackWidget from "./components/FeedbackWidget";

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
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-slate-950 text-slate-100">
        <Providers>
          <div className="min-h-screen flex flex-col">
            <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h1 className="text-xl font-extrabold text-indigo-400">TopPic</h1>

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

            <div className="flex-1 w-full flex flex-col">
              <div className="flex-1 w-full flex gap-6 px-4 lg:px-8 py-4">
                <aside className="hidden xl:flex w-64 shrink-0 sticky top-4 self-start flex-col gap-4">
                  <AdSlot placement="rail" variant="primary" />
                  <AdSlot placement="rail" variant="secondary" />
                </aside>

                <main className="flex-1 w-full">{children}</main>

                <aside className="hidden 2xl:flex w-64 shrink-0 sticky top-4 self-start">
                  <AdSlot
                    placement="rail"
                    variant="community"
                    className="w-full"
                  />
                </aside>
              </div>

              <div className="xl:hidden px-4 pb-6">
                <AdSlot placement="footer" variant="secondary" className="w-full" />
              </div>
            </div>

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
