import './knowledge.css';
import type { Metadata } from "next";
import "./globals.css";
import "./chat-appearance.css";

export const metadata: Metadata = {
  title: "Nexo · Tus asistentes, un solo lugar",
  description: "Administra asistentes Gemini, conocimiento y consumo de IA por empresa.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
