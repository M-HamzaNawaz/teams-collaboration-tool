import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import { RegisterServiceWorker } from "./register-sw";

// JobPulse type system: Inter for all UI, JetBrains Mono (tabular) for
// every CHANGING number — counts, timestamps, ids.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Confide",
  description: "Agency collaboration with client protection built in",
  applicationName: "Confide",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Confide" },
};

// M10-01/02: edge-to-edge on notched phones (safe-area insets handled in
// globals.css) and PWA theme color for both schemes.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f7" },
    { media: "(prefers-color-scheme: dark)", color: "#121415" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/* Apply the saved color theme BEFORE first paint — no flash. Runs
            ahead of hydration; suppressHydrationWarning covers the attr. The
            id is validated against the real palette after mount (an unknown
            value just falls back to the Classic Light :root defaults). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('confide-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
