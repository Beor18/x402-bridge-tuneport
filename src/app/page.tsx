"use client";

import { useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { ContentUnlock } from "@/components/ContentUnlock";

export default function Home() {
  const { login, logout, authenticated, user, createWallet } = usePrivy();
  const { wallets: evmWallets } = useWallets();
  const { wallets: solanaWallets, createWallet: createSolanaWallet } =
    useSolanaWallets();
  const [unlockedContent, setUnlockedContent] = useState<string | null>(null);
  const [isCreatingWallets, setIsCreatingWallets] = useState(false);

  const evmWallet = evmWallets[0];
  const solanaWallet = solanaWallets[0];

  async function handleCreateWallets() {
    setIsCreatingWallets(true);
    try {
      if (!evmWallet) await createWallet();
      if (!solanaWallet) await createSolanaWallet();
    } catch (e) {
      console.error("Error creating wallets:", e);
    }
    setIsCreatingWallets(false);
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="max-w-2xl mx-auto mb-8 sm:mb-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold">
              x402 Cross-Chain Pay
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Paga en Base, vendedor recibe en Solana
            </p>
          </div>
          {authenticated ? (
            <button
              onClick={logout}
              className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition text-sm whitespace-nowrap"
            >
              Desconectar
            </button>
          ) : (
            <button
              onClick={login}
              className="px-4 py-2 bg-violet-500 rounded-lg hover:bg-violet-600 transition text-sm font-medium whitespace-nowrap"
            >
              Conectar con Gmail
            </button>
          )}
        </div>

        {user && (
          <div className="p-4 bg-zinc-900 rounded-xl mb-6 sm:mb-8">
            <p className="text-sm text-zinc-400">Conectado como</p>
            <p className="font-medium break-all sm:break-normal">
              {user.email?.address || user.wallet?.address}
            </p>
          </div>
        )}

        {/* Wallet Status */}
        {authenticated && (
          <div className="p-4 bg-zinc-900 rounded-xl mb-6 sm:mb-8">
            <h3 className="text-sm font-medium text-zinc-400 mb-3">
              Wallets Detectadas
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                <span className="text-zinc-500">Base (EVM):</span>
                <span
                  className={`${
                    evmWallet ? "text-green-400" : "text-red-400"
                  } break-all sm:break-normal`}
                >
                  {evmWallet ? evmWallet.address : "No encontrada"}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                <span className="text-zinc-500">Solana:</span>
                <span
                  className={`${
                    solanaWallet ? "text-green-400" : "text-red-400"
                  } break-all sm:break-normal`}
                >
                  {solanaWallet ? solanaWallet.address : "No encontrada"}
                </span>
              </div>
            </div>

            {(!evmWallet || !solanaWallet) && (
              <button
                onClick={handleCreateWallets}
                disabled={isCreatingWallets}
                className="mt-4 w-full py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm disabled:opacity-50"
              >
                {isCreatingWallets
                  ? "Creando wallets..."
                  : "Crear Wallets Embedded"}
              </button>
            )}

            <p className="mt-4 text-xs text-zinc-500">
              💡 Si tus USDC están en otra wallet (MetaMask, Coinbase, etc.),
              puedes transferirlos a la dirección de arriba.
            </p>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-0">
        {/* Track on Solana - buyer pays from Base, facilitator bridges */}
        <ContentUnlock
          contentId="premium-track-1"
          title="🎵 Track Premium"
          description="Vendedor recibe USDC en Solana. Tú pagas desde Base y el facilitator hace el bridge CCTP automáticamente. Sin fricción, sin esperas."
          price="$0.10"
          sellerNetwork="solana"
          onUnlocked={(content) => {
            setUnlockedContent("¡Contenido desbloqueado!");
            console.log("Content:", content);
          }}
        />
      </div>

      {/* Success Message */}
      {unlockedContent && (
        <div className="fixed bottom-4 right-4 sm:bottom-8 sm:right-8 p-4 bg-green-500 rounded-xl shadow-lg z-50 max-w-[calc(100vw-2rem)] sm:max-w-none">
          <p className="font-medium text-sm sm:text-base">{unlockedContent}</p>
        </div>
      )}

      {/* Info */}
      <div className="max-w-2xl mx-auto mt-8 sm:mt-12 p-4 sm:p-6 bg-zinc-900/50 rounded-xl px-4 sm:px-6">
        <h2 className="text-lg font-bold mb-4">¿Cómo funciona?</h2>
        <ul className="space-y-2 text-zinc-400 text-sm">
          <li>
            <span className="text-violet-400">1.</span> Conectas con Gmail
            (Privy crea wallets automáticamente)
          </li>
          <li>
            <span className="text-violet-400">2.</span> Pagas con USDC desde
            Base usando x402 (solo una firma)
          </li>
          <li>
            <span className="text-violet-400">3.</span> El Facilitator recibe
            USDC en Base
          </li>
          <li>
            <span className="text-violet-400">4.</span> El Facilitator hace
            bridge CCTP a Solana automáticamente
          </li>
          <li>
            <span className="text-violet-400">5.</span> El vendedor recibe USDC
            en Solana (completado en background)
          </li>
          <li>
            <span className="text-violet-400">6.</span> Tú accedes al contenido
            inmediatamente
          </li>
        </ul>

        <div className="mt-6 p-4 bg-violet-950/30 border border-violet-800/50 rounded-lg">
          <p className="text-sm text-violet-300 font-medium mb-2">
            ✨ Experiencia sin fricción
          </p>
          <p className="text-xs text-zinc-400">
            Pagas en Base, el vendedor recibe en Solana. Todo automático gracias
            a CCTP (Cross-Chain Transfer Protocol de Circle).
          </p>
        </div>

        <div className="mt-4 p-3 bg-zinc-800 rounded-lg">
          <p className="text-xs text-zinc-500">
            <strong className="text-zinc-300">Tu wallet Base:</strong>{" "}
            <span className="break-all">
              {evmWallet?.address || "No conectada"}
            </span>
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            <strong className="text-zinc-300">Tu wallet Solana:</strong>{" "}
            <span className="break-all">
              {solanaWallet?.address || "No conectada"}
            </span>
          </p>
        </div>
      </div>
    </main>
  );
}
