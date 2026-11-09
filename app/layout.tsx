import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { ChatLauncher } from "@/components/chat-launcher";

export const metadata: Metadata = {
  title: { default: "DineLine · Saffron Grill", template: "%s · DineLine" },
  description: "Multi-agent AI phone crew for restaurants: orders, reservations and questions, with a live kitchen dashboard.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#1c1530" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <Sidebar />
        <main className="px-4 pt-6 pb-24 sm:px-6 lg:ml-[244px] lg:px-8 lg:pt-8">
          <div className="mx-auto max-w-[1360px]">{children}</div>
        </main>
        <ChatLauncher />
      </body>
    </html>
  );
}
