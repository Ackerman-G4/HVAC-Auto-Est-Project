import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { GoogleAuthProvider } from "@/components/auth/google-auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider } from "@/lib/auth/AuthContext";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "HVAC-AEST-EA — Engineering Automation Platform",
  description: "Next-generation HVAC estimation platform: intelligent cooling load analysis, automated equipment sizing, BOQ generation, and construction-ready outputs.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HVAC-AEST-EA",
  },
};

export const viewport: Viewport = {
  themeColor: "#148673",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body
        className={`${jakarta.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable} antialiased`}
      >
        <GoogleAuthProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </GoogleAuthProvider>
      </body>
    </html>
  );
}
