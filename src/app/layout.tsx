import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppFrame } from "@/components/AppFrame";
import type { SiteNavNode } from "@/components/SiteSwitcher";
import { currentUser } from "@/lib/auth/current";
import { getAllSites } from "@/lib/sites";
import { listPages } from "@/lib/registry";

async function buildSiteNav(): Promise<SiteNavNode[]> {
  const sites = await getAllSites();
  return Promise.all(
    Object.values(sites).map(async (s) => {
      const pages = await listPages(s.siteKey);
      return {
        key: s.siteKey,
        label: s.label,
        origin: s.origin,
        pages: pages.map((p) => ({ slug: p.slug, path: p.url.replace(/^https?:\/\/[^/]+/, "") || "/" })),
      };
    })
  );
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Outrigger Prototype Management Console",
  description: "Clone, prototype, and hand off Outrigger site features.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await currentUser();
  const sites = user ? await buildSiteNav() : [];
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex">
        <AppFrame user={user} sites={sites}>{children}</AppFrame>
      </body>
    </html>
  );
}
