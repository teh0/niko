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
    <html lang="en" className={lexend.variable}>
      <body className="font-sans">
        <div className="min-h-screen flex flex-col bg-background">
          <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2">
                <span className="flex items-center justify-center size-6 rounded-md bg-primary text-primary-foreground text-xs font-semibold">
                  N
                </span>
                <span className="text-sm font-semibold tracking-tight">
                  niko<span className="text-muted-foreground font-normal">.studio</span>
                </span>
              </Link>
              <nav className="flex gap-6 text-sm">
                <Link
                  href="/"
                  className="text-foreground/70 hover:text-foreground transition-colors"
                >
                  Projects
                </Link>
              </nav>
            </div>
            <Button asChild size="sm" className="h-8">
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
