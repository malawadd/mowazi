import type { Metadata } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans, Syne } from "next/font/google";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ParticleConnectKitProvider } from "@/components/ParticleConnectKitProvider";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Moeazi",
  description: "Moeazi manages LINK/USDC delta-neutral strategy accounts on Optimism and HyperLiquid.",
  icons: {
    icon: "/convex.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${syne.variable} ${plusJakartaSans.variable} ${plexMono.variable}`}>
        <ParticleConnectKitProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ParticleConnectKitProvider>
      </body>
    </html>
  );
}
