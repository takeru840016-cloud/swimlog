import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ScrollToTopOnNavigation } from "../components/scroll-to-top-on-navigation";

export const metadata: Metadata = { title: "SWIMLOG", description: "競泳記録管理", manifest: "/manifest.webmanifest", appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "SWIMLOG" }, icons: { apple: "/icon.svg", icon: "/icon.svg" } };
export const viewport: Viewport = { themeColor: "#1173b8", width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ja"><body><ScrollToTopOnNavigation />{children}</body></html>; }
