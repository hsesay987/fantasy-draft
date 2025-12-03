export const dynamic = "force-dynamic";

export default function DraftLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 overflow-x-hidden">
      {children}
    </div>
  );
}
