import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'aardwin Next.js Example',
  description: 'Reference authentication example using aardwin with Next.js 15 App Router',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
