import { Suspense } from "react";
import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { SessionProvider } from "@/components/session-provider";

export const metadata: Metadata = {
  title: { default: "Hilal Bilet Sistemi", template: "%s · Hilal" },
  description: "İmtahan və bilet idarəetmə platforması — Hilal Kursları",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="az">
      <body>
        <SessionProvider>
          <Suspense fallback={<div role="status">Səhifə yüklənir...</div>}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </SessionProvider>
      </body>
    </html>
  );
}
