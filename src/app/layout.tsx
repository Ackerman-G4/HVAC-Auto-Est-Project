import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono, IBM_Plex_Sans_Condensed } from "next/font/google";
import { GoogleAuthProvider } from "@/components/auth/google-auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

/*
 * The variables used to lie: --font-jakarta loaded Inter and
 * --font-space-grotesk loaded Poppins, so anyone reading the CSS believed the
 * wrong thing. They now say what they are.
 */

/** Body and UI. Genuinely excellent for interface text; kept. */
const bodyFont = Inter({
  variable: "--face-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/**
 * Display: section headers, table headers, eyebrows.
 *
 * Replaces Poppins, a geometric humanist face with wide friendly counters —
 * the wrong voice for an estimation tool, and one of the most-defaulted display
 * faces on the web. Condensed is the vernacular of the drawing title block and
 * the equipment schedule, and it stays compact in sentence case, which is what
 * makes deleting the ALL-CAPS labels possible without anything growing.
 */
const displayFont = IBM_Plex_Sans_Condensed({
  variable: "--face-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

/** Data, logs, IDs, dimensions. Pairs natively with Plex Sans; replaces
 *  JetBrains Mono so the app carries one mono face rather than two. */
const monoFont = IBM_Plex_Mono({
  variable: "--face-mono",
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
        className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} antialiased`}
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
