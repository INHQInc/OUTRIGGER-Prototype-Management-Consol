import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppFrame } from "@/components/AppFrame";
import { currentUser } from "@/lib/auth/current";
import { listOrgs } from "@/lib/orgs";
import { accessibleOrgIds, getActiveOrgId } from "@/lib/active-org";

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
  let orgs: { id: string; name: string }[] = [];
  let activeOrgId: string | null = null;
  const canCreate = user?.role === "admin";
  if (user) {
    const accessible = new Set(await accessibleOrgIds());
    orgs = (await listOrgs()).filter((o) => accessible.has(o.id)).map((o) => ({ id: o.id, name: o.name }));
    activeOrgId = await getActiveOrgId();
  }
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex">
        <AppFrame user={user} orgs={orgs} activeOrgId={activeOrgId} canCreate={canCreate}>{children}</AppFrame>
      </body>
    </html>
  );
}
