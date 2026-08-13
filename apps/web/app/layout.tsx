import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vid2Skill",
  description: "Turn a YouTube video into a Claude Agent Skill or a markdown summary.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const umamiWebsiteId = process.env.UMAMI_WEBSITE_ID;

  return (
    <html lang="en">
      <head>
        {umamiWebsiteId ? (
          <script defer src="https://cloud.umami.is/script.js" data-website-id={umamiWebsiteId}></script>
        ) : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
