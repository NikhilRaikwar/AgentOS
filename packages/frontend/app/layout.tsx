import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://agentos.nikhilraikwar.me"),
  title: {
    default: "AgentOS - The Operating System for Onchain AI Agents",
    template: "%s | AgentOS"
  },
  description:
    "AgentOS gives AI agents real ENS identities, user-owned smart wallets, Uniswap trading rails, and KeeperHub execution audit trails on Sepolia.",
  keywords: [
    "AgentOS",
    "onchain AI agents",
    "ENS agents",
    "ENS subnames",
    "Uniswap API",
    "KeeperHub",
    "ERC-8004",
    "smart wallets",
    "ETHGlobal Open Agents",
    "Sepolia"
  ],
  authors: [{ name: "Nikhil Raikwar" }],
  creator: "Nikhil Raikwar",
  publisher: "AgentOS",
  applicationName: "AgentOS",
  category: "DeFi",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png"
  },
  openGraph: {
    title: "AgentOS - The Operating System for Onchain AI Agents",
    description:
      "ENS-named AI agents with user-owned smart wallets, Uniswap financial rails, and KeeperHub execution proof.",
    url: "https://agentos.nikhilraikwar.me",
    siteName: "AgentOS",
    images: [
      {
        url: "/banner.png",
        width: 1200,
        height: 630,
        alt: "AgentOS - ENS-named AI agents with Uniswap and KeeperHub"
      }
    ],
    locale: "en_US",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentOS - Onchain AI Agents",
    description:
      "ENS-named AI agents with user-owned smart wallets, Uniswap trading, and KeeperHub execution proof.",
    images: ["/banner.png"]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1
    }
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
