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
        <h1 className="text-3xl font-bold mb-8">Test CCTP V2 Bridge</h1>

        <div className="space-y-6 bg-zinc-900 p-6 rounded-lg">
          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Amount (USDC)
            </label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-4 py-2 text-white"
              placeholder="0.1"
            />
            <p className="text-xs text-zinc-400 mt-1">
              Minimum: 0.01 USDC (no limit from Circle)
            </p>
          </div>

          {/* Recipient Input */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Solana Recipient Address
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-4 py-2 text-white font-mono text-sm"
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
              Use Fast Transfer (⚡ 30-60s vs 10-20min)
            </label>
          </div>

          {/* Execute Button */}
          <Button
            onClick={handleTestBridge}
            disabled={loading || !amount || !recipient}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Executing Bridge..." : "Execute Bridge"}
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
              <h3 className="font-bold mb-2">
                {result.success ? "✅ Success" : "❌ Error"}
              </h3>
              {result.success && result.txHash && (
                <div className="space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">Transaction Hash:</span>
                    <br />
                    <a
                      href={`https://basescan.org/tx/${result.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-400 hover:underline break-all"
                    >
                      {result.txHash}
                    </a>
                  </p>
                  {result.error && (
                    <p className="text-yellow-400 text-sm">⚠️ {result.error}</p>
                  )}
                </div>
              )}
              {!result.success && result.error && (
                <p className="text-red-400 text-sm break-all">{result.error}</p>
              )}
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-zinc-900 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Bridge Details</h2>
          <ul className="space-y-2 text-sm text-zinc-300">
            <li>
              <span className="font-medium">Source:</span> Base Mainnet
            </li>
            <li>
              <span className="font-medium">Destination:</span> Solana Mainnet
            </li>
            <li>
              <span className="font-medium">Token:</span> USDC
            </li>
            <li>
              <span className="font-medium">Contract:</span>{" "}
              <code className="text-xs bg-zinc-800 px-1 rounded">
                0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d
              </code>{" "}
              (TokenMessengerV2)
            </li>
            <li>
              <span className="font-medium">Protocol:</span> CCTP V2 (Fast
              Transfer enabled by default)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
