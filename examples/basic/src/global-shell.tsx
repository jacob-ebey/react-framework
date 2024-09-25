// I'm the global shell rendered in the React "client" environment. I'm responsible for rendering the
// basic structure of your website, including the HTML, head, and body tags. I get sent down to the user
// super quickly as I'm always located as close to the user as possible.

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
