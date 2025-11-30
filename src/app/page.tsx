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
              Cross-Chain Pay
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Paga fácilmente desde cualquier red
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
        {authenticated && (!evmWallet || !solanaWallet) && (
          <div className="p-4 bg-zinc-900 rounded-xl mb-6 sm:mb-8">
            <p className="text-sm text-zinc-400 mb-4">
              Se están preparando tus wallets automáticamente...
            </p>
            <button
              onClick={handleCreateWallets}
              disabled={isCreatingWallets}
              className="w-full py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm disabled:opacity-50"
            >
              {isCreatingWallets ? "Preparando..." : "Activar Wallets"}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-0">
        {/* Track on Solana - buyer pays from Base, facilitator bridges */}
        <ContentUnlock
          contentId="premium-track-1"
          title="🎵 Track Premium"
          description="Contenido exclusivo disponible para compra"
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
            <span className="text-violet-400">1.</span> Conectas con tu cuenta
          </li>
          <li>
            <span className="text-violet-400">2.</span> Pagas con USDC de forma
            rápida y segura
          </li>
          <li>
            <span className="text-violet-400">3.</span> Accedes al contenido
            inmediatamente
          </li>
        </ul>

        <div className="mt-6 p-4 bg-violet-950/30 border border-violet-800/50 rounded-lg">
          <p className="text-sm text-violet-300 font-medium mb-2">
            ✨ Pago rápido y seguro
          </p>
          <p className="text-xs text-zinc-400">
            Todo el proceso es automático. Solo necesitas pagar y disfrutar del
            contenido.
          </p>
        </div>
      </div>
    </main>
  );
}
