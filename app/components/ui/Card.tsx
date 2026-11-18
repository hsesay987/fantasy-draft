export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`surface p-5 ${className}`}
    >
      {children}
    </div>
  );
}
