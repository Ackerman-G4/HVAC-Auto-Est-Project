import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Poppins } from "next/font/google";
import { GoogleAuthProvider } from "@/components/auth/google-auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

const jakarta = Inter({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const spaceGrotesk = Poppins({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "HVAC Studio — Engineering Estimation Platform",
  description: "HVAC Studio: intelligent cooling load analysis, automated equipment sizing, BOQ generation, engineering-grade CFD, and construction-ready outputs.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HVAC Studio",
  },
};

export const viewport: Viewport = {
  themeColor: "#1f3f62",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Resolve the theme before first paint.

          data-theme used to be hardcoded to "dark" here and corrected from
          localStorage in an effect after hydration, so every light-theme user
          watched the app flash dark-to-light on each load. This runs
          synchronously during head parsing, so the first paint is already
          correct. Keep it inline and blocking — deferring it reintroduces the
          flash.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('hvac-ui-theme');" +
              "document.documentElement.setAttribute('data-theme'," +
              "t==='light'||t==='dark'?t:'dark')}catch(e){" +
              "document.documentElement.setAttribute('data-theme','dark')}})()",
          }}
        />
      </head>
      <body
        className={`${jakarta.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable} antialiased`}
      >
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <GoogleAuthProvider>
          <AppShell>{children}</AppShell>
        </GoogleAuthProvider>
      </body>
    </html>
  );
}
