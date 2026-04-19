import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Niko Studio",
  description: "AI-driven mobile/web studio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-border px-6 py-3 flex items-center gap-4">
            <Link href="/" className="font-mono text-accent">
              niko<span className="text-fg">.studio</span>
            </Link>
            <nav className="flex gap-4 text-sm text-muted">
              <Link href="/" className="hover:text-fg">Projects</Link>
              <Link href="/intake/new" className="hover:text-fg">+ New</Link>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
