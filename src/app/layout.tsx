import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Lexend } from "next/font/google";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const lexend = Lexend({
  subsets: ["latin"],
  variable: "--font-lexend",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Niko Studio",
  description: "AI-driven mobile/web studio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${lexend.variable}`}>
      <body className="font-sans">
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-border px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="font-mono text-primary text-sm">
                niko<span className="text-foreground">.studio</span>
              </Link>
              <nav className="flex gap-4 text-sm text-muted-foreground">
                <Link href="/" className="hover:text-foreground transition-colors">
                  Projects
                </Link>
              </nav>
            </div>
            <Button asChild size="sm">
              <Link href="/intake/new">
                <Plus className="size-4" />
                New project
              </Link>
            </Button>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
