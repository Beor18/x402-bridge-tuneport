"use client";

import { useState, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { useMultiChainBalance } from "@/hooks/useMultiChainBalance";
import { createWalletClient, custom, type Hex } from "viem";
import { base } from "viem/chains";

interface ContentUnlockProps {
  contentId: string;
  title: string;
  description: string;
  price: string; // e.g., "$0.10"
  sellerNetwork?: "base" | "solana";
  onUnlocked?: (content: unknown) => void;
}

export function ContentUnlock({
  contentId,
  title,
  description,
  price,
  sellerNetwork = "solana",
  onUnlocked,
}: ContentUnlockProps) {
  const { login, authenticated, ready } = usePrivy();
  const { wallets: evmWallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();

  const { balances, isLoading } = useMultiChainBalance(true);

  const [status, setStatus] = useState<
    "idle" | "signing" | "paying" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusDetail, setStatusDetail] = useState<string>("");

  // Use first EVM wallet (embedded or external)
  const evmWallet = evmWallets[0];
  const solanaWallet = solanaWallets[0];

  async function handleUnlock() {
    if (!authenticated) {
      login();
      return;
    }

    if (!evmWallet) {
      setErrorMessage("No hay wallet EVM conectada");
      return;
    }

    // For this flow, we always pay from Base (facilitator handles bridge)
    const baseBalance = parseFloat(balances?.base.balance || "0");
    const requiredAmount = parseFloat(price.replace("$", ""));

    if (baseBalance < requiredAmount) {
      setErrorMessage(`Necesitas al menos ${price} USDC en Base`);
      return;
    }

    setStatus("signing");
    setStatusDetail("Obteniendo requisitos de pago...");
    setErrorMessage(null);

    try {
      console.log("[UI] Starting x402 payment flow");
      console.log("[UI] Wallet:", evmWallet.address);

      const provider = await evmWallet.getEthereumProvider();

      // Step 1: Get payment requirements (402 response)
      const initialResponse = await fetch(`/api/unlock/${contentId}`);

      if (initialResponse.status !== 402) {
        if (initialResponse.ok) {
          const result = await initialResponse.json();
          setStatus("success");
          onUnlocked?.(result);
          return;
        }
        throw new Error("Unexpected response");
      }

      const requirementsData = await initialResponse.json();
      const paymentRequirements = requirementsData.accepts?.[0];

      if (!paymentRequirements) {
        throw new Error("No payment requirements received");
      }

      console.log("[UI] Payment requirements:", paymentRequirements);

      // Step 2: Build EIP-712 typed data for TransferWithAuthorization
      const validAfter = 0;
      const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      const nonce =
        "0x" +
        Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

      const typedData = {
        types: {
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "TransferWithAuthorization" as const,
        domain: {
          name: paymentRequirements.extra?.name || "USD Coin",
          version: paymentRequirements.extra?.version || "2",
          chainId: paymentRequirements.extra?.chainId || 8453,
          verifyingContract: paymentRequirements.asset as `0x${string}`,
        },
        message: {
          from: evmWallet.address as `0x${string}`,
          to: paymentRequirements.payTo as `0x${string}`,
          value: BigInt(paymentRequirements.maxAmountRequired),
          validAfter: BigInt(validAfter),
          validBefore: BigInt(validBefore),
          nonce: nonce as `0x${string}`,
        },
      };

      console.log("[UI] Signing typed data...");
      setStatusDetail("Firma la autorización en tu wallet...");

      // Step 3: Sign with wallet
      const signature = (await provider.request({
        method: "eth_signTypedData_v4",
        params: [
          evmWallet.address,
          JSON.stringify(typedData, (_, v) =>
            typeof v === "bigint" ? v.toString() : v
          ),
        ],
      })) as Hex;

      console.log("[UI] Signature obtained");

      // Step 4: Build x402 payment payload
      const paymentPayload = {
        x402Version: 1,
        scheme: "exact",
        network: "base",
        payload: {
          signature,
          authorization: {
            from: evmWallet.address,
            to: paymentRequirements.payTo,
            value: paymentRequirements.maxAmountRequired,
            validAfter: validAfter.toString(),
            validBefore: validBefore.toString(),
            nonce,
          },
        },
      };

      // Encode as base64 for X-PAYMENT header
      const encodedPayload = btoa(JSON.stringify(paymentPayload));

      setStatus("paying");
      setStatusDetail("Verificando pago...");

      // Step 5: Send payment
      const response = await fetch(`/api/unlock/${contentId}`, {
        method: "GET",
        headers: {
          "X-PAYMENT": encodedPayload,
        },
      });

      console.log("[UI] Response status:", response.status);

      if (response.ok) {
        const result = await response.json();
        console.log("[UI] Success:", result);
        setStatus("success");

        // Show bridge info if applicable
        if (result.bridge?.success && sellerNetwork === "solana") {
          setStatusDetail(
            "✅ Pago confirmado y bridge a Solana completado exitosamente."
          );
        } else {
          setStatusDetail("");
        }

        onUnlocked?.(result);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("[UI] Payment failed:", errorData);
        throw new Error(
          errorData.error || errorData.reason || "Payment failed"
        );
      }
    } catch (error) {
      console.error("[UI] Error:", error);
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Error desconocido"
      );
      setStatusDetail("");
    }
  }

  if (!ready) {
    return <div className="animate-pulse bg-zinc-800 rounded-xl h-48" />;
  }

  return (
    <div className="bg-zinc-900 rounded-2xl p-6 max-w-md">
      {/* Content Preview */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2">{title}</h2>
        <p className="text-zinc-400 text-sm">{description}</p>
      </div>

      {/* Price */}
      <div className="flex items-center justify-between mb-6 p-4 bg-zinc-800 rounded-xl">
        <span className="text-zinc-400">Precio</span>
        <span className="text-2xl font-bold">{price}</span>
      </div>

      {/* Balance Display */}
      {authenticated && (
        <div className="mb-6 space-y-2">
          {isLoading ? (
            <div className="text-center py-4 text-zinc-500">
              Cargando balances...
            </div>
          ) : balances ? (
            <>
              <div className="text-xs text-zinc-600 mb-2">
                Red: Base Mainnet + Solana Mainnet
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Base USDC</span>
                <span
                  className={
                    balances.base.hasBalance
                      ? "text-green-400"
                      : "text-zinc-500"
                  }
                >
                  ${parseFloat(balances.base.balance).toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Solana USDC</span>
                <span
                  className={
                    balances.solana.hasBalance
                      ? "text-green-400"
                      : "text-zinc-500"
                  }
                >
                  ${parseFloat(balances.solana.balance).toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-zinc-700">
                <span className="text-zinc-400">Total USDC</span>
                <span className="font-medium text-white">
                  ${parseFloat(balances.totalUsdc).toFixed(4)}
                </span>
              </div>
            </>
          ) : (
            <div className="text-center py-4 text-zinc-500">
              No se encontraron wallets
            </div>
          )}
        </div>
      )}

      {/* Payment Info */}
      {authenticated && (
        <div className="mb-4 p-3 bg-zinc-800/50 rounded-lg text-sm space-y-2">
          {/* Seller network info */}
          <div className="flex items-center gap-2 text-zinc-400">
            <span>📍</span>
            <span>
              Vendedor en:{" "}
              <span className="text-white font-medium">
                {sellerNetwork === "solana" ? "Solana" : "Base"}
              </span>
            </span>
          </div>

          {/* Payment strategy */}
          {balances &&
          parseFloat(balances.base.balance) >=
            parseFloat(price.replace("$", "")) ? (
            <div className="flex items-center gap-2 text-green-400">
              <span>✓</span>
              <span>Pagarás desde Base (USDC)</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-400">
              <span>✗</span>
              <span>Saldo insuficiente en Base</span>
            </div>
          )}

          {/* Bridge info if seller on Solana */}
          {sellerNetwork === "solana" && (
            <div className="flex items-center gap-2 text-violet-400 text-xs">
              <span>🔄</span>
              <span>
                El facilitator ejecutará el bridge completo a Solana (puede
                tomar 10-20 min)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-500/20 rounded-lg text-sm text-red-400">
          {errorMessage}
        </div>
      )}

      {/* Status Detail */}
      {statusDetail && (
        <div className="mb-4 text-center text-sm text-violet-400 animate-pulse">
          {statusDetail}
        </div>
      )}

      {/* Action Button */}
      <button
        onClick={handleUnlock}
        disabled={status === "signing" || status === "paying" || isLoading}
        className={`
          w-full py-4 rounded-xl font-bold transition-all
          ${
            status === "success"
              ? "bg-green-500 text-white"
              : authenticated &&
                balances &&
                parseFloat(balances.base.balance) <
                  parseFloat(price.replace("$", ""))
              ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
              : "bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:opacity-90"
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {!authenticated && "Conectar Wallet"}
        {authenticated && status === "idle" && `Desbloquear por ${price}`}
        {status === "signing" && "Esperando firma..."}
        {status === "paying" && "Verificando pago..."}
        {status === "success" && "✓ Desbloqueado"}
        {status === "error" && "Reintentar"}
      </button>

      {/* Wallet Info */}
      {authenticated && (
        <div className="mt-4 text-xs text-zinc-500 space-y-1">
          {evmWallet && <div>Base: {evmWallet.address.slice(0, 8)}...</div>}
          {solanaWallet && (
            <div>Solana: {solanaWallet.address.slice(0, 8)}...</div>
          )}
        </div>
      )}
    </div>
  );
}
