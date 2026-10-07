import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import "./globals.css";
import "./experience.css";

export const metadata: Metadata = { title: "SafeKeep — Post-purchase safety", description: "A private, explainable post-purchase safety network." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><div className="app-shell"><Nav /><main id="main-content" tabIndex={-1}>{children}</main></div></body></html>;
}
