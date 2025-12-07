"use client";

import { useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { ContentUnlock } from "@/components/ContentUnlock";
import { SolBridgeContentUnlock } from "@/components/SolBridgeContentUnlock";
import { PlayerBar } from "@/components/PlayerBar";
import { SolBridge } from "@/components/SolBridge";
import { useMultiChainBalance } from "@/hooks/useMultiChainBalance";

export default function Home() {
  const { login, logout, authenticated, user, createWallet } = usePrivy();
  const { wallets: evmWallets } = useWallets();
  const { wallets: solanaWallets, createWallet: createSolanaWallet } =
    useSolanaWallets();
  const { balances, isLoading: isLoadingBalance } = useMultiChainBalance(true);
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
    <main className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8 pb-20 md:pb-24">
      {/* Header */}
      <div className="max-w-2xl mx-auto mb-8 sm:mb-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold">Tunepay</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Paga fácilmente desde Base ↔ Solana
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {authenticated && (
              <div className="text-right hidden sm:block">
                {isLoadingBalance ? (
                  <div className="text-xs text-zinc-500">Cargando...</div>
                ) : balances ? (
                  <div className="flex flex-col items-end gap-1 text-xs sm:text-sm">
                    {parseFloat(balances.base.ethBalance) > 0 && (
                      <div>
                        <span className="text-zinc-400">Base: </span>
                        <span className="font-medium text-blue-400">
                          {parseFloat(balances.base.ethBalance).toFixed(4)} ETH
                        </span>
                      </div>
                    )}
                    {parseFloat(balances.solana.solBalance) > 0 && (
                      <div>
                        <span className="text-zinc-400">Solana: </span>
                        <span className="font-medium text-purple-400">
                          {parseFloat(balances.solana.solBalance).toFixed(4)}{" "}
                          SOL
                        </span>
                      </div>
                    )}
                    {parseFloat(balances.base.ethBalance) === 0 &&
                      parseFloat(balances.solana.solBalance) === 0 && (
                        <div className="text-zinc-500">Sin balance</div>
                      )}
                  </div>
                ) : null}
              </div>
            )}
            {authenticated ? (
              <button
                onClick={logout}
                className="px-3 sm:px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition text-xs sm:text-sm whitespace-nowrap"
              >
                <span className="hidden sm:inline">Desconectar</span>
                <span className="sm:hidden">Salir</span>
              </button>
            ) : (
              <button
                onClick={login}
                className="px-3 sm:px-4 py-2 bg-violet-500 rounded-lg hover:bg-violet-600 transition text-xs sm:text-sm font-medium whitespace-nowrap"
              >
                Conectar
              </button>
            )}
          </div>
        </div>

        {user && (
          <div className="p-3 sm:p-4 bg-zinc-900 rounded-xl mb-4 sm:mb-6 md:mb-8 flex items-center gap-2">
            <p className="text-xs sm:text-sm text-zinc-400 hidden sm:inline">
              Conectado como
            </p>
            <p className="text-xs sm:text-sm font-medium break-all sm:break-normal">
              {user.wallet?.address.slice(0, 6)}...
              {user.wallet?.address.slice(-4)}
            </p>
          </div>
        )}

        {/* Wallet Status */}
        {authenticated && (!evmWallet || !solanaWallet) && (
          <div className="p-3 sm:p-4 bg-zinc-900 rounded-xl mb-4 sm:mb-6 md:mb-8">
            <p className="text-xs sm:text-sm text-zinc-400 mb-3 sm:mb-4">
              Se están preparando tus wallets automáticamente...
            </p>
            <button
              onClick={handleCreateWallets}
              disabled={isCreatingWallets}
              className="w-full py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-xs sm:text-sm disabled:opacity-50"
            >
              {isCreatingWallets ? "Preparando..." : "Activar Wallets"}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Bridge SOL Component */}
        {/* <SolBridge /> */}

        {/* Track con Bridge de SOL - Solana → Base (con dirección destino personalizada) */}
        <SolBridgeContentUnlock
          contentId="premium-track-sol-bridge-1"
          title="Solana → Base"
          audioUrl="https://example.com/audio/premium-track.mp3"
          previewUrl="https://example.com/audio/premium-track-preview.mp3"
          imageUrl="https://turquoise-neighbouring-mule-736.mypinata.cloud/ipfs/QmYvdwzcHcQn5a6CTvd5puLcQmDvFsrc1WyUQBgDoJKaDo/gauchito-gil.webp"
          description="Beor"
          price="0.1 SOL"
          sellerNetwork="base"
          destinationAddress="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb" // Dirección Base destino del artista/vendedor
          onUnlocked={(content) => {
            setUnlockedContent("¡Contenido desbloqueado con bridge de SOL!");
            console.log("Content:", content);
          }}
        />

        {/* Track con Bridge de SOL - Base → Solana (con dirección destino personalizada) */}
        <SolBridgeContentUnlock
          contentId="premium-track-sol-bridge-2"
          title="Base → Solana"
          audioUrl="https://example.com/audio/track-2.mp3"
          previewUrl="https://example.com/audio/track-2-preview.mp3"
          imageUrl="https://turquoise-neighbouring-mule-736.mypinata.cloud/ipfs/QmYvdwzcHcQn5a6CTvd5puLcQmDvFsrc1WyUQBgDoJKaDo/gauchito-gil.webp"
          description="Artista"
          price="0.05 SOL"
          sellerNetwork="solana"
          destinationAddress="8YevvQPwQRsKwzaqaAujLcTs7cbZts9tBzPsXhRymbw8" // Dirección Solana destino del artista/vendedor
          onUnlocked={(content) => {
            setUnlockedContent("¡Bridge completado y contenido desbloqueado!");
            console.log("Content:", content);
          }}
        />

        {/* Track on Solana - buyer pays from Base, facilitator bridges (USDC) */}
        {/* <ContentUnlock
          contentId="premium-track-1"
          title="El Santo de los Humildes (USDC)"
          audioUrl="https://example.com/audio/premium-track.mp3"
          previewUrl="https://example.com/audio/premium-track-preview.mp3"
          imageUrl="https://turquoise-neighbouring-mule-736.mypinata.cloud/ipfs/QmYvdwzcHcQn5a6CTvd5puLcQmDvFsrc1WyUQBgDoJKaDo/gauchito-gil.webp"
          description="Beor"
          price="$0.10"
          sellerNetwork="solana"
          onUnlocked={(content) => {
            setUnlockedContent("¡Contenido desbloqueado con USDC!");
            console.log("Content:", content);
          }}
        /> */}
      </div>

      {/* Success Message */}
      {unlockedContent && (
        <div className="fixed bottom-4 right-4 sm:bottom-8 sm:right-8 p-4 bg-green-500 rounded-xl shadow-lg z-50 max-w-[calc(100vw-2rem)] sm:max-w-none">
          <p className="font-medium text-sm sm:text-base">{unlockedContent}</p>
        </div>
      )}

      {/* Info */}
      <div className="max-w-2xl mx-auto mt-6 sm:mt-8 md:mt-12 p-4 sm:p-6 bg-zinc-900/50 rounded-xl">
        <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4">
          ¿Cómo funciona?
        </h2>
        <ul className="space-y-2 text-zinc-400 text-xs sm:text-sm">
          <li>
            <span className="text-violet-400">1.</span> Conectas con tu cuenta
          </li>
          <li>
            <span className="text-violet-400">2.</span> Pagas de forma rápida y
            segura
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

      {/* Player Bar */}
      <PlayerBar />
    </main>
  );
}
