export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-card/80 p-5 backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}
