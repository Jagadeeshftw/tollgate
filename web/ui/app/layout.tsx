import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  weight: ["400", "500", "600", "700", "800"],
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
});

const DESCRIPTION =
  "A marketplace where AI agents discover data services by ENS name and pay per call on Hedera.";

/**
 * `metadataBase` is what turns the relative `/og-image.png` below into an absolute URL a link
 * preview can actually fetch. Pinned to the Railway URL, not the custom domain, until the
 * domain's certificate is confirmed issued — an absolute image URL that does not resolve yet
 * would break every link preview in the meantime. Flip this once `tollgate.0xo.in` is live.
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://tollgate-web-production.up.railway.app"),
  title: { default: "Tollgate", template: "Tollgate — %s" },
  description: DESCRIPTION,
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Tollgate",
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Tollgate" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tollgate",
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
