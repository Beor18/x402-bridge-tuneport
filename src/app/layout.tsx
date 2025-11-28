import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "x402 Multi-Chain Unlock",
  description: "Pay with USDC from Base or Solana",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-white min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

