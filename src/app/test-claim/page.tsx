"use client";

import { useState } from "react";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { Button } from "@/components/ui/button";
import { Transaction, Connection } from "@solana/web3.js";
import { executeClaimUsdcOnSolana } from "@/lib/solana/cctp-claim";

export default function TestClaimPage() {
  const [txHash, setTxHash] = useState(
    "0xb248a16f46e3f8a9deeb5d46e597a4f984ec8011b328b9d05dcc43ffa2d2aff5"
  );
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<any>(null);

  const { wallets: solanaWallets } = useSolanaWallets();
  const solanaWallet = solanaWallets[0];

  const handleClaim = async () => {
    if (!txHash.trim()) {
      setError("Por favor ingresa un transaction hash");
      return;
    }

    if (!solanaWallet) {
      setError("No hay wallet de Solana conectada");
      return;
    }

    setProcessing(true);
    setStatus("Procesando...");
    setError(null);
    setClaimResult(null);

    try {
      // Paso 1: Obtener mensaje y attestation
      const response = await fetch("/api/test/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          txHash: txHash.trim(),
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to prepare claim");
      }

      console.log("[Test Claim] Message and attestation received:", data);
      setStatus("Confirmando en Solana...");

      // Paso 2: Ejecutar el claim
      const privySignAndSendTransaction = async (params: {
        transaction: Transaction;
      }) => {
        const rpcUrl =
          process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
          "https://mainnet.helius-rpc.com/?api-key=fc2a2d0a-fc68-4801-bd64-3e56031e4838";

        const connection = new Connection(rpcUrl, "confirmed");
        const signature = await solanaWallet.sendTransaction(
          params.transaction,
          connection
        );

        return {
          signature: typeof signature === "string" ? signature : signature,
        };
      };

      const claimResult = await executeClaimUsdcOnSolana(
        data.message,
        data.attestation,
        solanaWallet.address,
        privySignAndSendTransaction
      );

      setClaimResult(claimResult);

      if (claimResult.success) {
        setStatus(null);
        console.log(
          "[Test Claim] ✓ Claim executed successfully:",
          claimResult.signature
        );
      } else {
        setStatus(null);
        throw new Error(claimResult.error || "Claim failed");
      }
    } catch (e: any) {
      console.error("Claim error:", e);
      setStatus(null);
      setError(e.message || "An unexpected error occurred");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6 text-white">
        Reclamar USDC
      </h1>

      <div className="bg-zinc-800 p-6 rounded-lg shadow-lg">
        <p className="text-zinc-300 mb-6">
          Reclama tu USDC en Solana con un solo clic.
        </p>

        {/* Solana Wallet Status */}
        {solanaWallet ? (
          <div className="mb-6 p-4 bg-green-900/20 border border-green-700/50 rounded-lg">
            <p className="text-green-400 text-sm">
              ✓ Wallet conectada
            </p>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
            <p className="text-red-400 text-sm">
              ⚠️ Conecta tu wallet de Solana primero
            </p>
          </div>
        )}

        <Button
          onClick={handleClaim}
          disabled={processing || !txHash.trim() || !solanaWallet}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed text-lg"
        >
          {processing
            ? status || "Procesando..."
            : "Reclamar USDC"}
        </Button>

        {status && (
          <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
            <p className="text-blue-300 text-sm">{status}</p>
          </div>
        )}

        {claimResult && claimResult.success && (
          <div className="mt-6 p-4 bg-green-900/20 border border-green-700/50 rounded-lg">
            <p className="text-green-400 font-bold mb-2">
              ✓ ¡Listo! Tu USDC ha sido reclamado exitosamente.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 bg-red-900/30 border border-red-700 p-4 rounded-lg">
          <p className="text-red-400 font-bold mb-2">Error</p>
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
