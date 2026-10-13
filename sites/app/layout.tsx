import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3002";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.png", metadataBase).toString();
  return {
    metadataBase,
    title: {
      default: "mBAB — Multi-Book Advanced Bible Search",
      template: "%s · mBAB",
    },
    description: "Search Scripture across books with transparent Boolean logic, carefully scoped editions, and shareable results.",
    applicationName: "mBAB",
    keywords: ["Bible search", "Boolean Bible search", "Scripture search", "multi-book Bible search"],
    authors: [{ name: "Aaron John Sabu" }],
    creator: "Aaron John Sabu",
    icons: { icon: { url: "/favicon.svg", type: "image/svg+xml" } },
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      title: "mBAB — Find the thread, not just the word.",
      description: "A transparent advanced Bible search studio for finding patterns across Scripture.",
      siteName: "mBAB",
      images: [{ url: socialImage, width: 1732, height: 908, alt: "mBAB — Find the thread, not just the word." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "mBAB — Find the thread, not just the word.",
      description: "Search Scripture across books with transparent Boolean logic.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
