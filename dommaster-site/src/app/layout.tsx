import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/sections/Footer";
import { ModalProvider } from "@/components/ModalProvider";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "DomMaster — Премиальный ремонт под ключ в Башкирии",
  description:
    "Ремонт квартир и домов под ключ в Салавате, Стерлитамаке, Ишимбае. Более 120 объектов. Гарантия 3 года. Без скрытых платежей. Рассчитайте стоимость онлайн.",
  keywords: ["ремонт под ключ", "ремонт квартир", "отделка", "Салават", "Стерлитамак", "Ишимбай"],
  openGraph: {
    title: "DomMaster — Премиальный ремонт под ключ",
    description: "Ремонт квартир и домов в Башкирии. 120+ объектов, гарантия 3 года.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} h-full scroll-smooth`}>
      <body className="min-h-full flex flex-col font-sans antialiased">
        <ModalProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </ModalProvider>
        <Toaster />
      </body>
    </html>
  );
}
