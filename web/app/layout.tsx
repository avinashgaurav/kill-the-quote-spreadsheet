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

export default function RootLayout({ children }: LayoutProps<"/">) {
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
