export const dynamic = "force-dynamic";

export default function DraftLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full text-foreground overflow-x-hidden">
      {children}
    </div>
  );
}
