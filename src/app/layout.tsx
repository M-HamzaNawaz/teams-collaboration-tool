import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { RegisterServiceWorker } from "./register-sw";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d13" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Restore the saved theme BEFORE first paint — no flash. Runs
            ahead of hydration; suppressHydrationWarning covers the attr. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('confide-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`,
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
