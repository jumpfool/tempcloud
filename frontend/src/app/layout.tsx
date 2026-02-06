import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "tempcloud",
  description: "Temporary file sharing",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <div className="min-h-screen flex flex-col">
          <header className="border-b">
            <div className="mx-auto max-w-2xl px-6 h-14 flex items-center justify-between">
              <a href="/" className="flex items-center gap-2 text-sm font-medium tracking-tight">
                <span className="font-mono">tempcloud</span>
              </a>
              <nav className="flex items-center gap-4 text-sm text-muted-foreground">
                <a href="/" className="hover:text-foreground transition-colors">
                  Upload
                </a>
              </nav>
            </div>
          </header>

          <main className="flex-1 mx-auto max-w-2xl w-full px-6 py-10">
            {children}
          </main>

          <footer className="border-t">
            <div className="mx-auto max-w-2xl px-6 h-12 flex items-center justify-between text-xs text-muted-foreground">
              <span>tempcloud</span>
              <span className="font-mono">files expire automatically</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
