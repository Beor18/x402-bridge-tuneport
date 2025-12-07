"use client";

import { useState, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { PublicKey, Connection } from "@solana/web3.js";
import { createWalletClient, custom, Address } from "viem";
import { base, baseSepolia } from "viem/chains";
import bs58 from "bs58";
import {
  bridgeSolToBase,
  bridgeTokenToSolana,
  SOLANA_DEVNET_CONFIG,
  BASE_SEPOLIA_CONFIG,
} from "@/lib/base-solana-bridge";
import { Loader2, ArrowRightLeft, CheckCircle2, XCircle } from "lucide-react";

type BridgeDirection = "solana-to-base" | "base-to-solana";
type BridgeStatus = "idle" | "bridging" | "success" | "error";

export function SolBridge() {
  const { user, ready } = usePrivy();
  const { wallets: evmWallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();

  const [direction, setDirection] = useState<BridgeDirection>("solana-to-base");
  const [amount, setAmount] = useState<string>("0.1");
  const [destinationAddress, setDestinationAddress] = useState<string>("");
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);

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

  const handleBridge = async () => {
    if (!ready) return;

    setStatus("bridging");
    setError(null);

    try {
      if (direction === "solana-to-base") {
        await handleSolanaToBaseBridge();
      } else {
        await handleBaseToSolanaBridge();
      }
    } catch (err) {
      console.error("Error en bridge:", err);
      setError(err instanceof Error ? err.message : "Error desconocido");
      setStatus("error");
    }
  };

  const handleSolanaToBaseBridge = async () => {
    if (!solanaPublicKey || !solanaWallet || !connection) {
      throw new Error("Por favor conecta tu wallet de Solana");
    }

    // Validar dirección Base destino
    const baseAddress = destinationAddress || evmWallet?.address;
    if (
      !baseAddress ||
      !baseAddress.startsWith("0x") ||
      baseAddress.length !== 42
    ) {
      throw new Error("Dirección Base destino inválida");
    }

    // Verificar balance
    // El gas sponsorship requiere que el usuario pague SOL en Solana
    // para que el relayer pague el gas en Base. El mínimo estimado es ~0.001 SOL
    // pero puede variar según el gas limit configurado
    const balance = await connection.getBalance(solanaPublicKey);
    const balanceInSol = balance / 1e9;
    const estimatedGasFee = 0.001; // ~$0.18 a precios actuales para 200k gas limit
    const requiredAmount = parseFloat(amount) + estimatedGasFee;

    if (balanceInSol < requiredAmount) {
      throw new Error(
        `Balance insuficiente. Tienes ${balanceInSol.toFixed(
          4
        )} SOL, necesitas al menos ${requiredAmount.toFixed(
          4
        )} SOL (${amount} SOL + ~${estimatedGasFee} SOL para gas sponsorship)`
      );
    }

    // Crear transacción de bridge (devnet para pruebas)
    const { transaction } = await bridgeSolToBase({
      connection,
      payer: solanaPublicKey,
      to: baseAddress,
      amount: parseFloat(amount),
      useMainnet: false, // Usar devnet/testnet
    });

    // Enviar usando la API de Privy v1.88.0
    // sendTransaction espera una Transaction, no Uint8Array
    const signature = await solanaWallet.sendTransaction(
      transaction,
      connection
    );

    // Confirmar transacción
    await connection.confirmTransaction(signature, "confirmed");

    console.log(
      "✅ Bridge completado. El SOL se minteará en Base automáticamente."
    );
    setStatus("success");
  };

  const handleBaseToSolanaBridge = async () => {
    if (!evmWallet) {
      throw new Error("Por favor conecta tu wallet de Base");
    }

    // Validar dirección Solana destino
    const solAddress = destinationAddress || solanaAddress;
    if (!solAddress) {
      throw new Error("Dirección Solana destino requerida");
    }

    try {
      new PublicKey(solAddress);
    } catch {
      throw new Error("Dirección Solana inválida");
    }

    // Verificar que esté en Base Sepolia (testnet)
    const currentChainId = evmWallet.chainId;
    const baseSepoliaChainId = baseSepolia.id;
    const currentChainIdNum =
      typeof currentChainId === "string"
        ? parseInt(currentChainId.replace("eip155:", ""))
        : currentChainId;

    if (currentChainIdNum !== baseSepoliaChainId) {
      await evmWallet.switchChain(baseSepoliaChainId);
    }

    // Crear walletClient (Base Sepolia para pruebas)
    const provider = await evmWallet.getEthereumProvider();
    const walletClient = createWalletClient({
      chain: baseSepolia, // Usar Base Sepolia (testnet)
      transport: custom(provider),
      account: evmWallet.address as `0x${string}`,
    });

    // Verificar balance de WSOL (Base Sepolia testnet)
    const { getSolBalanceInBase } = await import("@/lib/base-solana-bridge");
    const wsolBalance = await getSolBalanceInBase(
      evmWallet.address as Address,
      false // Usar devnet/testnet
    );
    const wsolBalanceInSol = Number(wsolBalance) / 1e18;
    const requiredAmount = parseFloat(amount) + 0.001;

    if (wsolBalanceInSol < requiredAmount) {
      throw new Error(
        `Balance insuficiente de WSOL. Tienes ${wsolBalanceInSol.toFixed(
          4
        )} WSOL, necesitas ${requiredAmount.toFixed(4)} WSOL`
      );
    }

    // Ejecutar bridge (devnet/testnet)
    const amountLamports = BigInt(Math.floor(parseFloat(amount) * 1e9));
    const txHash = await bridgeTokenToSolana({
      walletClient,
      to: solAddress,
      amount: amountLamports,
      useMainnet: false, // Usar devnet/testnet
    });

    console.log("✅ Bridge completado. TxHash:", txHash);
    setStatus("success");
  };

  if (!ready) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 bg-zinc-900 rounded-xl border border-zinc-800">
      <div className="flex items-center gap-3 mb-6">
        <ArrowRightLeft className="h-6 w-6 text-violet-400" />
        <div>
          <h2 className="text-xl font-bold">Bridge SOL</h2>
          <p className="text-xs text-yellow-400 mt-1">🔧 Testnet/Devnet Mode</p>
        </div>
      </div>

      {/* Selector de dirección */}
      <div className="mb-4">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setDirection("solana-to-base")}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
              direction === "solana-to-base"
                ? "bg-violet-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            Solana → Base
          </button>
          <button
            onClick={() => setDirection("base-to-solana")}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
              direction === "base-to-solana"
                ? "bg-violet-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            Base → Solana
          </button>
        </div>
      </div>

      {/* Formulario */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-2">
            Cantidad (SOL)
          </label>
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-4 py-2 bg-zinc-800 rounded-lg text-white border border-zinc-700 focus:border-violet-500 focus:outline-none"
            placeholder="0.1"
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-2">
            Dirección destino{" "}
            <span className="text-zinc-500">
              ({direction === "solana-to-base" ? "Base" : "Solana"})
            </span>
          </label>
          <input
            type="text"
            value={destinationAddress}
            onChange={(e) => setDestinationAddress(e.target.value)}
            className="w-full px-4 py-2 bg-zinc-800 rounded-lg text-white border border-zinc-700 focus:border-violet-500 focus:outline-none font-mono text-sm"
            placeholder={
              direction === "solana-to-base"
                ? evmWallet?.address || "0x..."
                : solanaAddress || "Solana address..."
            }
          />
          <p className="text-xs text-zinc-500 mt-1">
            {direction === "solana-to-base"
              ? "Si está vacío, se usará tu wallet de Base"
              : "Si está vacío, se usará tu wallet de Solana"}
          </p>
        </div>

        {/* Estado de wallets */}
        <div className="p-3 bg-zinc-800/50 rounded-lg text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-zinc-400">Solana Wallet:</span>
            <span className={solanaAddress ? "text-green-400" : "text-red-400"}>
              {solanaAddress
                ? `${solanaAddress.slice(0, 6)}...${solanaAddress.slice(-4)}`
                : "No conectada"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Base Wallet:</span>
            <span className={evmWallet ? "text-green-400" : "text-red-400"}>
              {evmWallet
                ? `${evmWallet.address.slice(0, 6)}...${evmWallet.address.slice(
                    -4
                  )}`
                : "No conectada"}
            </span>
          </div>
        </div>

        {/* Botón de bridge */}
        <button
          onClick={handleBridge}
          disabled={
            status === "bridging" ||
            !amount ||
            parseFloat(amount) <= 0 ||
            (direction === "solana-to-base" && !solanaPublicKey) ||
            (direction === "base-to-solana" && !evmWallet)
          }
          className="w-full py-3 bg-violet-600 hover:bg-violet-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
        >
          {status === "bridging" ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Procesando bridge...
            </>
          ) : (
            <>
              <ArrowRightLeft className="h-5 w-5" />
              Bridge SOL
            </>
          )}
        </button>

        {/* Mensajes de estado */}
        {status === "success" && (
          <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-400" />
            <p className="text-green-400 text-sm">
              Bridge completado exitosamente. El relayer automático procesará la
              transacción.
            </p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-400" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
