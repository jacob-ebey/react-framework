export default function GlobalShell({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <html>
      <head></head>
      <body>{children}</body>
    </html>
  );
}
