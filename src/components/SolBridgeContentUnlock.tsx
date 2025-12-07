"use client";

import { useState, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { PublicKey, Connection } from "@solana/web3.js";
import { createWalletClient, custom, Address } from "viem";
import { baseSepolia } from "viem/chains";
import {
  bridgeSolToBase,
  bridgeTokenToSolana,
  SOLANA_DEVNET_CONFIG,
  BASE_SEPOLIA_CONFIG,
  getSolBalanceInBase,
} from "@/lib/base-solana-bridge";
import { usePlayer } from "@/contexts/PlayerContext";
import { Loader2, ArrowRightLeft, CheckCircle2, XCircle } from "lucide-react";

interface SolBridgeContentUnlockProps {
  contentId: string;
  title: string;
  description: string;
  price: string; // Precio en SOL (ej: "0.1 SOL")
  sellerNetwork?: "base" | "solana";
  destinationAddress?: string; // Dirección destino opcional (Base o Solana según sellerNetwork)
  imageUrl?: string;
  previewUrl?: string;
  audioUrl?: string;
  onUnlocked?: (content: unknown) => void;
}

export function SolBridgeContentUnlock({
  contentId,
  title,
  description,
  price,
  sellerNetwork = "solana",
  destinationAddress,
  imageUrl,
  previewUrl,
  audioUrl,
  onUnlocked,
}: SolBridgeContentUnlockProps) {
  const { login, authenticated, ready } = usePrivy();
  const { wallets: evmWallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();
  const { playTrack } = usePlayer();

  const [status, setStatus] = useState<
    "idle" | "bridging" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusDetail, setStatusDetail] = useState<string>("");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [solanaBalance, setSolanaBalance] = useState<number>(0);
  const [baseBalance, setBaseBalance] = useState<number>(0);

  const evmWallet = evmWallets[0];
  const solanaWallet = solanaWallets?.[0];

  // Obtener dirección Solana
  const solanaAddress = solanaWallet?.address || null;
  const solanaPublicKey = solanaAddress ? new PublicKey(solanaAddress) : null;

  // Crear connection (devnet para pruebas) con configuración mejorada
  useEffect(() => {
    if (typeof window !== "undefined") {
      const connection = new Connection(SOLANA_DEVNET_CONFIG.rpcUrl, {
        commitment: "confirmed",
        confirmTransactionInitialTimeout: 60000, // 60 segundos timeout
      });
      setConnection(connection);
    }
  }, []);

  // Obtener balances
  useEffect(() => {
    const fetchBalances = async () => {
      if (connection && solanaPublicKey) {
        try {
          const balance = await connection.getBalance(solanaPublicKey);
          setSolanaBalance(balance / 1e9);
        } catch (error) {
          console.error("Error fetching Solana balance:", error);
        }
      }
      if (evmWallet?.address) {
        try {
          const wsolBalance = await getSolBalanceInBase(
            evmWallet.address as Address,
            false // devnet
          );
          setBaseBalance(Number(wsolBalance) / 1e18);
        } catch (error) {
          console.error("Error fetching Base balance:", error);
        }
      }
    };

    if (authenticated) {
      fetchBalances();
      const interval = setInterval(fetchBalances, 10000); // Actualizar cada 10 segundos
      return () => clearInterval(interval);
    }
  }, [connection, solanaPublicKey, evmWallet?.address, authenticated]);

  // Extraer cantidad de SOL del precio (ej: "0.1 SOL" -> 0.1)
  const priceAmount = parseFloat(
    price.replace(" SOL", "").replace("SOL", "").trim()
  );

  const handleUnlock = async () => {
    if (!authenticated) {
      login();
      return;
    }

    setStatus("bridging");
    setStatusDetail("Iniciando bridge...");
    setErrorMessage(null);

    try {
      if (sellerNetwork === "solana") {
        // El vendedor está en Solana, el comprador debe bridgear desde Base
        await handleBaseToSolanaBridge();
      } else {
        // El vendedor está en Base, el comprador debe bridgear desde Solana
        await handleSolanaToBaseBridge();
      }
    } catch (error) {
      console.error("Error en bridge:", error);
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Error desconocido"
      );
      setStatusDetail("");
    }
  };

  const handleSolanaToBaseBridge = async () => {
    if (!solanaPublicKey || !solanaWallet || !connection) {
      throw new Error("Por favor conecta tu wallet de Solana");
    }

    // Usar destinationAddress si está proporcionada, sino usar la wallet de Base conectada
    const baseAddress = destinationAddress || evmWallet?.address;
    if (!baseAddress) {
      throw new Error(
        "Por favor conecta tu wallet de Base o proporciona una dirección destino"
      );
    }

    // Validar que sea una dirección Base válida
    if (!baseAddress.startsWith("0x") || baseAddress.length !== 42) {
      throw new Error("Dirección Base destino inválida");
    }

    // Verificar balance
    const estimatedGasFee = 0.001;
    const requiredAmount = priceAmount + estimatedGasFee;

    if (solanaBalance < requiredAmount) {
      throw new Error(
        `Balance insuficiente. Tienes ${solanaBalance.toFixed(
          4
        )} SOL, necesitas al menos ${requiredAmount.toFixed(
          4
        )} SOL (${priceAmount} SOL + ~${estimatedGasFee} SOL para gas)`
      );
    }

    setStatusDetail("Creando transacción de bridge...");

    // Crear transacción de bridge (devnet)
    const { transaction } = await bridgeSolToBase({
      connection,
      payer: solanaPublicKey,
      to: baseAddress,
      amount: priceAmount,
      useMainnet: false,
    });

    setStatusDetail("Firmando transacción en Solana...");

    // Enviar transacción
    const signature = await solanaWallet.sendTransaction(
      transaction,
      connection
    );

    setStatusDetail("Esperando confirmación...");

    // Confirmar transacción
    await connection.confirmTransaction(signature, "confirmed");

    setStatus("success");
    setStatusDetail("");
    onUnlocked?.({ contentId, bridgeTx: signature });
  };

  const handleBaseToSolanaBridge = async () => {
    if (!evmWallet) {
      throw new Error("Por favor conecta tu wallet de Base");
    }

    // Usar destinationAddress si está proporcionada, sino usar la wallet de Solana conectada
    const solAddress = destinationAddress || solanaAddress;
    if (!solAddress) {
      throw new Error(
        "Por favor conecta tu wallet de Solana o proporciona una dirección destino"
      );
    }

    // Validar que sea una dirección Solana válida
    try {
      new PublicKey(solAddress);
    } catch {
      throw new Error("Dirección Solana destino inválida");
    }

    // Verificar que esté en Base Sepolia
    const currentChainId = evmWallet.chainId;
    const baseSepoliaChainId = baseSepolia.id;
    const currentChainIdNum =
      typeof currentChainId === "string"
        ? parseInt(currentChainId.replace("eip155:", ""))
        : currentChainId;

    if (currentChainIdNum !== baseSepoliaChainId) {
      setStatusDetail("Cambiando a Base Sepolia...");
      await evmWallet.switchChain(baseSepoliaChainId);
    }

    // Verificar balance de WSOL
    if (baseBalance < priceAmount) {
      throw new Error(
        `Balance insuficiente de WSOL. Tienes ${baseBalance.toFixed(
          4
        )} WSOL, necesitas al menos ${priceAmount.toFixed(4)} WSOL`
      );
    }

    setStatusDetail("Creando transacción de bridge...");

    // Crear walletClient
    const provider = await evmWallet.getEthereumProvider();
    const walletClient = createWalletClient({
      chain: baseSepolia,
      transport: custom(provider),
      account: evmWallet.address as `0x${string}`,
    });

    setStatusDetail("Firmando transacción en Base...");

    // Ejecutar bridge
    const amountLamports = BigInt(Math.floor(priceAmount * 1e9));
    const txHash = await bridgeTokenToSolana({
      walletClient,
      to: solAddress,
      amount: amountLamports,
      useMainnet: false,
    });

    setStatus("success");
    setStatusDetail("");
    onUnlocked?.({ contentId, bridgeTx: txHash });
  };

  const handlePreview = () => {
    if (!previewUrl) return;
    playTrack({
      title,
      artist: description || "Artista desconocido",
      imageUrl: imageUrl || undefined,
      audioUrl: previewUrl,
    });
  };

  const handlePlayUnlocked = () => {
    if (!audioUrl) return;
    playTrack({
      title,
      artist: description || "Artista desconocido",
      imageUrl: imageUrl || undefined,
      audioUrl: audioUrl,
    });
  };

  if (!ready) {
    return <div className="animate-pulse bg-zinc-800 rounded-xl h-48" />;
  }

  const isUnlocked = status === "success";
  const hasBalance =
    sellerNetwork === "solana"
      ? baseBalance >= priceAmount
      : solanaBalance >= priceAmount + 0.001;

  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden w-full border border-zinc-800">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 p-3 sm:p-4">
        {/* Album Cover */}
        <div className="relative flex-shrink-0 self-center sm:self-auto">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden">
            {imageUrl ? (
              <img
                src={imageUrl}
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
              <CheckCircle2 className="w-3 h-3 text-white" />
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
              <p className="text-xs text-yellow-400 mt-0.5">🔧 Testnet</p>
            </div>
          </div>

          {/* Bridge Direction Info */}
          {/* <div className="mb-2 p-2 bg-zinc-800/50 rounded text-xs">
            <div className="flex items-center gap-2 text-zinc-400">
              <ArrowRightLeft className="w-3 h-3" />
              <span>
                Bridge desde{" "}
                {sellerNetwork === "solana" ? "Base → Solana" : "Solana → Base"}
              </span>
            </div>
            <div className="mt-1 flex justify-between text-zinc-500">
              <span>Solana: {solanaBalance.toFixed(4)} SOL</span>
              <span>Base: {baseBalance.toFixed(4)} WSOL</span>
            </div>
          </div> */}

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
            {isUnlocked && audioUrl ? (
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
            ) : (
              <>
                {previewUrl && (
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

                <button
                  onClick={handleUnlock}
                  disabled={
                    status === "bridging" ||
                    (authenticated &&
                      sellerNetwork === "solana" &&
                      !evmWallet) ||
                    (authenticated &&
                      sellerNetwork === "base" &&
                      !solanaPublicKey) ||
                    (authenticated && !hasBalance)
                  }
                  className={`
                    flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2
                    ${
                      authenticated && !hasBalance
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
                      <ArrowRightLeft className="w-4 h-4" />
                      Desbloquear
                    </>
                  )}
                  {status === "bridging" && (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  )}
                  {status === "success" && (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Desbloqueado
                    </>
                  )}
                  {status === "error" && "Reintentar"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
