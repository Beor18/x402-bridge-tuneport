"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { base, baseSepolia } from "viem/chains";
import { PlayerProvider } from "@/contexts/PlayerContext";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

function MissingConfigMessage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-8">
      <div className="max-w-lg text-center">
        <h1 className="text-3xl font-bold mb-4">⚠️ Configuración Requerida</h1>
        <p className="text-zinc-400 mb-6">
          Necesitas configurar tu Privy App ID para usar esta aplicación.
        </p>
        <div className="bg-zinc-900 p-4 rounded-xl text-left mb-6">
          <p className="text-sm text-zinc-500 mb-2">1. Crea una cuenta en:</p>
          <a
            href="https://dashboard.privy.io"
            target="_blank"
            rel="noopener"
            className="text-violet-400 hover:underline"
          >
            https://dashboard.privy.io
          </a>

          <p className="text-sm text-zinc-500 mt-4 mb-2">
            2. Crea un archivo .env.local:
          </p>
          <code className="block bg-zinc-800 p-2 rounded text-sm">
            NEXT_PUBLIC_PRIVY_APP_ID=tu_app_id
          </code>

          <p className="text-sm text-zinc-500 mt-4 mb-2">
            3. Reinicia el servidor
          </p>
        </div>
      </div>
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Si no hay App ID configurado, mostrar instrucciones
  if (!PRIVY_APP_ID) {
    return <MissingConfigMessage />;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#8B5CF6",
        },
        embeddedWallets: {
          createOnLogin: "all-users",
          showWalletUIs: false,
        },
        defaultChain: base,
        supportedChains: [base, baseSepolia],
        // Enable Solana
        solanaClusters: [
          {
            name: "mainnet-beta",
            rpcUrl:
              process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
              "https://mainnet.helius-rpc.com/?api-key=fc2a2d0a-fc68-4801-bd64-3e56031e4838",
          },
          { name: "devnet", rpcUrl: "https://api.devnet.solana.com" },
        ],
      }}
    >
      <PlayerProvider>{children}</PlayerProvider>
    </PrivyProvider>
  );
}
