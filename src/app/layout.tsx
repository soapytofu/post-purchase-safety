import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = { title: "SafeKeep — Post-purchase safety", description: "A private, explainable post-purchase safety network." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><div className="app-shell"><Nav /><main>{children}</main></div></body></html>;
}
