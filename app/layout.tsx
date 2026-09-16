import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "tripla 価格モニタリング",
  description: "tripla と主要OTAの実質販売価格を日毎に比較するダッシュボード",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
