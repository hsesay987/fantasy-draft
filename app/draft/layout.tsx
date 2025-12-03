export const dynamic = "force-dynamic";

export default function DraftLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen w-screen bg-slate-950 text-slate-100 overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
