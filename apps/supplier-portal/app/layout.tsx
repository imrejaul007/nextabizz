import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Supplier Portal - NextaBizz',
  description: 'Supplier Portal for NextaBizz',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
