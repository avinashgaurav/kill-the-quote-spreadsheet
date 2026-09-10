import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Quote Workbench",
  description:
    "Draft an RFx, read whatever suppliers send back, and interrogate the " +
    "comparison in plain language.",
};

/**
 * Props typed here rather than with Next's generated `LayoutProps<"/">`.
 *
 * That helper is written into `.next/types` by `next dev` or `next build`, so
 * it exists on any machine that has run the app and does NOT exist in a fresh
 * clone. Which meant `npm run verify` — the command the README tells a reader
 * to run first — failed on a clean checkout with:
 *
 *   app/layout.tsx(23,50): error TS2304: Cannot find name 'LayoutProps'.
 *
 * Invisible to me because my tree has always had the generated types. Found by
 * cloning the repo into a temporary directory and running the documented
 * commands as a stranger would, which is the only way this class of thing gets
 * found: every check I ran in place passed.
 *
 * A root layout takes children. Depending on a build artifact to say so buys
 * nothing and costs a first impression.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        {/* Tooltips carry the caveat text on every cell in the grid, so the
            provider has to wrap the whole tree. Delay is short: at 150 cells,
            a slow tooltip makes scanning the grid feel broken. */}
        <TooltipProvider delayDuration={120} skipDelayDuration={300}>
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
