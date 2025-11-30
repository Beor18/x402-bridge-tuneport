"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface BridgeResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export default function TestBridgePage() {
  const [amount, setAmount] = useState("0.1");
  const [recipient, setRecipient] = useState(
    "6Kseo7s41VPyaFJUTYeiNDmtZXftKkcmXqHV8qWUajL4"
  );
  const [useFastTransfer, setUseFastTransfer] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BridgeResult | null>(null);

  async function handleTestBridge() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/test/bridge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          solanaRecipient: recipient,
          useFastTransfer,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message || "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Enviar USDC a Solana</h1>

        <div className="space-y-6 bg-zinc-900 p-6 rounded-lg">
          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Cantidad (USDC)
            </label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-4 py-2 text-white"
              placeholder="0.1"
            />
          </div>

          {/* Recipient Input */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Dirección en Solana
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-4 py-2 text-white"
              placeholder="6Kseo7s41VPyaFJUTYeiNDmtZXftKkcmXqHV8qWUajL4"
            />
          </div>

          {/* Fast Transfer Toggle */}
          <div className="flex items-center gap-4">
            <input
              type="checkbox"
              id="fastTransfer"
              checked={useFastTransfer}
              onChange={(e) => setUseFastTransfer(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="fastTransfer" className="text-sm">
              Envío rápido ⚡
            </label>
          </div>

          {/* Execute Button */}
          <Button
            onClick={handleTestBridge}
            disabled={loading || !amount || !recipient}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Enviando..." : "Enviar"}
          </Button>

          {/* Result Display */}
          {result && (
            <div
              className={`p-4 rounded-lg ${
                result.success
                  ? "bg-green-900/30 border border-green-700"
                  : "bg-red-900/30 border border-red-700"
              }`}
            >
              {result.success ? (
                <div>
                  <p className="font-bold mb-2 text-green-400">✅ ¡Enviado exitosamente!</p>
                  {result.error && (
                    <p className="text-yellow-400 text-sm mt-2">⚠️ {result.error}</p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="font-bold mb-2 text-red-400">❌ Error</p>
                  <p className="text-red-300 text-sm">{result.error}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
