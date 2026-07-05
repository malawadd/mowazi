import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Moeazi Demo Capture Routes",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DemoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
