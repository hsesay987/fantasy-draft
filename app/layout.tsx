import "./globals.css";
import type { Metadata } from "next";

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
        {/* App Shell */}
        <div className="min-h-screen flex flex-col">
          {/* Global Header (lightweight, optional per-page) */}
          <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <h1 className="text-xl font-extrabold tracking-tight text-indigo-400">
              GameFilter
            </h1>

            <span className="text-xs text-slate-500">
              drafts • quizzes • chaos
            </span>
          </header>

          {/* Main Content */}
          <main className="flex-1 w-full">{children}</main>
        </div>
      </body>
    </html>
  );
}
// import "./globals.css";
// import type { Metadata } from "next";

// export const metadata: Metadata = {
//   title: "Fantasy Era Draft",
//   description: "Custom NBA / NFL / EPL fantasy era drafting game",
// };

// export default function RootLayout({
//   children,
// }: {
//   children: React.ReactNode;
// }) {
//   return (
//     <html lang="en">
//       <body className="min-h-screen bg-slate-950 text-slate-100">
//         <div className="max-w-5xl mx-auto px-4 py-6">
//           <header className="mb-6 flex items-center justify-between">
//             <h1 className="text-2xl font-bold">Fantasy Era Draft</h1>
//           </header>
//           {children}
//         </div>
//       </body>
//     </html>
//   );
// }
