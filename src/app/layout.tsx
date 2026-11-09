import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { PREFERENCES_BOOT_SCRIPT } from "@/lib/preferences";
import "@/styles/globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "AEGIS AI",
  description:
    "AI-assisted business operations — finances, mail and modules in one workspace.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${inter.variable} ${jetBrainsMono.variable} h-full antialiased`}
      // The boot script sets data-theme and data-text-size before React
      // hydrates, so the server's <html> never matches them exactly.
      suppressHydrationWarning
    >
      <head>
        {/* Theme and text size, applied before first paint: see src/lib/preferences.ts. */}
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOT_SCRIPT }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
