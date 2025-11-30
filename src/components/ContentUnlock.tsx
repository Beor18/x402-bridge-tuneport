"use client";

import { useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useMultiChainBalance } from "@/hooks/useMultiChainBalance";
import { createWalletClient, custom, type Hex } from "viem";
import { base } from "viem/chains";
import { usePlayer } from "@/contexts/PlayerContext";

interface ContentUnlockProps {
  contentId: string;
  title: string;
  description: string;
  price: string;
  sellerNetwork?: "base" | "solana";
  imageUrl?: string;
  previewUrl?: string;
  audioUrl?: string;
  onUnlocked?: (content: unknown) => void;
}

export function ContentUnlock({
  contentId,
  title,
  description,
  price,
  sellerNetwork = "solana",
  imageUrl,
  previewUrl,
  audioUrl,
  onUnlocked,
}: ContentUnlockProps) {
  const { login, authenticated, ready } = usePrivy();
  const { wallets: evmWallets } = useWallets();
  const { balances, isLoading } = useMultiChainBalance(true);
  const { playTrack } = usePlayer();

  const [status, setStatus] = useState<
    "idle" | "signing" | "paying" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusDetail, setStatusDetail] = useState<string>("");
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(
    imageUrl || null
  );
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(
    audioUrl || null
  );

  const evmWallet = evmWallets[0];

  async function handleUnlock() {
    if (!authenticated) {
      login();
      return;
    }

    if (!evmWallet) {
      setErrorMessage("No hay wallet EVM conectada");
      return;
    }

    const baseBalance = parseFloat(balances?.base.balance || "0");
    const requiredAmount = parseFloat(price.replace("$", ""));

    if (baseBalance < requiredAmount) {
      setErrorMessage(`Saldo insuficiente. Necesitas al menos ${price} USDC`);
      return;
    }

    setStatus("signing");
    setStatusDetail("Preparando pago...");
    setErrorMessage(null);

    try {
      const provider = await evmWallet.getEthereumProvider();
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

      const validAfter = 0;
      const validBefore = Math.floor(Date.now() / 1000) + 3600;
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

      setStatusDetail("Firma la autorización en tu wallet...");
      const signature = (await provider.request({
        method: "eth_signTypedData_v4",
        params: [
          evmWallet.address,
          JSON.stringify(typedData, (_, v) =>
            typeof v === "bigint" ? v.toString() : v
          ),
        ],
      })) as Hex;

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

      const encodedPayload = btoa(JSON.stringify(paymentPayload));
      setStatus("paying");
      setStatusDetail("Verificando pago...");

      const response = await fetch(`/api/unlock/${contentId}`, {
        method: "GET",
        headers: { "X-PAYMENT": encodedPayload },
      });

      if (response.ok) {
        const result = await response.json();
        setStatus("success");
        setStatusDetail("");

        const audioUrlFromResponse =
          result.audioUrl || result.content?.audioUrl || audioUrl;
        const imageUrlFromResponse =
          result.imageUrl ||
          result.content?.imageUrl ||
          result.content?.coverImage ||
          imageUrl;

        if (audioUrlFromResponse) setCurrentAudioUrl(audioUrlFromResponse);
        if (imageUrlFromResponse) setCurrentImageUrl(imageUrlFromResponse);

        onUnlocked?.(result);
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || errorData.reason || "Payment failed"
        );
      }
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Error desconocido"
      );
      setStatusDetail("");
    }
  }

  const handlePreview = () => {
    if (!previewUrl) return;
    playTrack({
      title,
      artist: description || "Artista desconocido",
      imageUrl: currentImageUrl || undefined,
      audioUrl: previewUrl,
    });
  };

  const handlePlayUnlocked = () => {
    if (!currentAudioUrl) return;
    playTrack({
      title,
      artist: description || "Artista desconocido",
      imageUrl: currentImageUrl || undefined,
      audioUrl: currentAudioUrl,
    });
  };

  if (!ready) {
    return <div className="animate-pulse bg-zinc-800 rounded-xl h-48" />;
  }

  const isUnlocked = status === "success";
  const hasBalance =
    balances &&
    parseFloat(balances.base.balance) >= parseFloat(price.replace("$", ""));

  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden w-full">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 p-3 sm:p-4">
        {/* Album Cover */}
        <div className="relative flex-shrink-0 self-center sm:self-auto">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden">
            {currentImageUrl ? (
              <img
                src={currentImageUrl}
                alt={title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-violet-600 via-fuchsia-600 to-purple-600 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-white/30"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
              </div>
            )}
          </div>

          {!isUnlocked && (
            <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
              <svg
                className="w-8 h-8 text-white/80"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
          )}

          {isUnlocked && (
            <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-1">
              <svg
                className="w-3 h-3 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Track Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-base sm:text-lg font-bold truncate">
                {title.replace("🎵 ", "")}
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 truncate">
                {description || "Artista desconocido"}
              </p>
            </div>
            <div className="flex-shrink-0 text-left sm:text-right">
              <span className="text-base sm:text-lg font-bold text-violet-400">
                {price}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mt-2 p-2 bg-red-500/20 border border-red-700/50 rounded text-xs text-red-400">
              {errorMessage}
            </div>
          )}

          {/* Status Detail */}
          {statusDetail && (
            <div className="mt-2 text-xs text-violet-400 animate-pulse text-center">
              {statusDetail}
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            {previewUrl && !isUnlocked && (
              <button
                onClick={handlePreview}
                className="flex-1 py-2 px-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Preview
              </button>
            )}

            {isUnlocked && currentAudioUrl && (
              <button
                onClick={handlePlayUnlocked}
                className="flex-1 py-2 px-3 bg-green-500 hover:bg-green-600 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 text-white"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Reproducir
              </button>
            )}

            <button
              onClick={handleUnlock}
              disabled={
                status === "signing" ||
                status === "paying" ||
                isLoading ||
                (authenticated && !hasBalance && !isUnlocked) ||
                isUnlocked
              }
              className={`
                flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2
                ${
                  status === "success"
                    ? "bg-green-500 text-white cursor-default"
                    : authenticated && !hasBalance && !isUnlocked
                    ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                    : isUnlocked
                    ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:opacity-90 text-white"
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {!authenticated && (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Conectar
                </>
              )}
              {authenticated && status === "idle" && !isUnlocked && (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                    />
                  </svg>
                  Desbloquear
                </>
              )}
              {status === "signing" && (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Firmando...
                </>
              )}
              {status === "paying" && (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Procesando...
                </>
              )}
              {status === "success" && (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Desbloqueado
                </>
              )}
              {status === "error" && "Reintentar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
