import type { Metadata } from "next";
import "./globals.css";
import { NO_FLASH_SCRIPT, ThemeProvider } from "./theme";

export const metadata: Metadata = {
  title: "Vid2Skill",
  description: "Turn a YouTube video into a Claude Agent Skill or a markdown summary.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const umamiWebsiteId = process.env.UMAMI_WEBSITE_ID;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        {umamiWebsiteId ? (
          <script defer src="https://cloud.umami.is/script.js" data-website-id={umamiWebsiteId}></script>
        ) : null}
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
