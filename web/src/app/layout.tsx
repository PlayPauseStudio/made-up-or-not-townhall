import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// One face everywhere. next/font also generates a size-matched "Inter Fallback"
// (in --font-inter), so text does not jump while the font loads.
const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Made Up or Not',
  description: 'Two teams, one category board.',
};

export const viewport: Viewport = {
  themeColor: '#0e0a14',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
