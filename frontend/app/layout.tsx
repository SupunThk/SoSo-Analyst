import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "SoSo Analyst | AI Crypto Research Terminal",
  description: "AI analysis agent for SoSoValue APIs — real-time crypto market intelligence, ETF flows, macro events, and tokenomics.",
  manifest: "/manifest.json",
};

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Web3Provider } from "@/components/Web3Provider";
import { Toaster } from "react-hot-toast";
import { CommandPalette } from "@/components/CommandPalette";
import { MuiThemeProvider } from "@/components/MuiThemeProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${ibmPlexMono.variable}`}>
      <body className="antialiased relative">
        <ErrorBoundary>
          <MuiThemeProvider>
            <Web3Provider>
              <AuthProvider>
                <a href="#main-content" className="skip-link">
                  Skip to main content
                </a>
                {children}
                <CommandPalette />
                <Toaster position="bottom-right" toastOptions={{ className: 'font-mono text-sm', style: { background: '#050805', color: '#00ff9d', border: '1px solid rgba(0, 255, 157, 0.3)' } }} />
              </AuthProvider>
            </Web3Provider>
          </MuiThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
