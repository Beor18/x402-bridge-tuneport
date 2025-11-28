"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import {
  getMultiChainBalances,
  canAfford,
  type WalletBalances,
} from "@/lib/balance";

export function useMultiChainBalance(isMainnet: boolean = true) {
  const { authenticated } = usePrivy();
  const { wallets: evmWallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();

  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get wallet addresses - use first available wallet
  const evmWallet = evmWallets[0]; // Any EVM wallet (Privy, MetaMask, etc.)
  const solanaWallet = solanaWallets[0];

  const baseAddress = evmWallet?.address || null;
  const solanaAddress = solanaWallet?.address || null;

  // Debug logging (safe from BigInt serialization)
  console.log(
    "[Balance] EVM wallets:",
    evmWallets.length,
    evmWallets.map((w) => w.address)
  );
  console.log(
    "[Balance] Solana wallets:",
    solanaWallets.length,
    solanaWallets.map((w) => w.address)
  );
  console.log("[Balance] Using Base:", baseAddress, "Solana:", solanaAddress);

  const fetchBalances = useCallback(async () => {
    if (!authenticated || (!baseAddress && !solanaAddress)) {
      setBalances(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getMultiChainBalances(
        baseAddress,
        solanaAddress,
        isMainnet
      );
      setBalances(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch balances");
    } finally {
      setIsLoading(false);
    }
  }, [authenticated, baseAddress, solanaAddress, isMainnet]);

  // Fetch on mount and when wallets change
  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  // Check if user can afford a specific price
  const checkAffordability = useCallback(
    (price: string) => {
      if (!balances)
        return { canPay: false, payWith: null, needsBridge: false };
      return canAfford(balances, price);
    },
    [balances]
  );

  return {
    balances,
    isLoading,
    error,
    refetch: fetchBalances,
    checkAffordability,
    baseAddress,
    solanaAddress,
    hasAnyWallet: !!baseAddress || !!solanaAddress,
  };
}
