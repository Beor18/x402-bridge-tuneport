/**
 * Verify that a Solana wallet received USDC
 * Used to confirm payment delivery before unlocking content
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { SOLANA_MAINNET } from "@/lib/cctp/constants";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=fc2a2d0a-fc68-4801-bd64-3e56031e4838";

/**
 * Get current USDC balance of a Solana wallet
 */
export async function getSolanaWalletUsdcBalance(
  walletAddress: string
): Promise<number> {
  try {
    const connection = new Connection(SOLANA_RPC_URL, "confirmed");
    const owner = new PublicKey(walletAddress);
    const mint = new PublicKey(USDC_MINT);
    const tokenAccount = await getAssociatedTokenAddress(mint, owner);

    const account = await getAccount(connection, tokenAccount);
    const balance = Number(account.amount) / 1e6; // USDC has 6 decimals

    return balance;
  } catch (error) {
    // Account might not exist yet or RPC error
    console.log(
      `[Balance Check] Could not fetch balance for ${walletAddress}:`,
      error instanceof Error ? error.message : error
    );
    return 0;
  }
}

/**
 * Wait for USDC balance to increase by expected amount
 * Polls the wallet balance until it increases, with timeout
 */
export async function waitForUsdcDelivery(
  walletAddress: string,
  expectedAmount: number,
  initialBalance: number,
  options?: {
    maxWaitTime?: number; // Maximum wait time in seconds (default: 5 minutes)
    pollInterval?: number; // Polling interval in milliseconds (default: 5 seconds)
  }
): Promise<{
  success: boolean;
  finalBalance: number;
  received: number;
  error?: string;
}> {
  const maxWaitTime = (options?.maxWaitTime || 300) * 1000; // 5 minutes default
  const pollInterval = options?.pollInterval || 5000; // 5 seconds default
  const startTime = Date.now();

  console.log(
    `[Balance Check] Waiting for ${expectedAmount} USDC to arrive at ${walletAddress}...`
  );
  console.log(`[Balance Check] Initial balance: ${initialBalance} USDC`);

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const currentBalance = await getSolanaWalletUsdcBalance(walletAddress);
      const received = currentBalance - initialBalance;

      console.log(
        `[Balance Check] Current balance: ${currentBalance} USDC (received: ${received.toFixed(
          6
        )} USDC)`
      );

      // Check if we received at least the expected amount (with small tolerance for fees)
      const tolerance = 0.001; // 0.001 USDC tolerance
      if (received >= expectedAmount - tolerance) {
        console.log(
          `[Balance Check] ✅ USDC received! Final balance: ${currentBalance} USDC`
        );
        return {
          success: true,
          finalBalance: currentBalance,
          received: received,
        };
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error("[Balance Check] Error checking balance:", error);
      // Continue polling even if there's an error
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  // Timeout reached
  const finalBalance = await getSolanaWalletUsdcBalance(walletAddress);
  const received = finalBalance - initialBalance;
  const elapsed = Math.floor((Date.now() - startTime) / 1000);

  console.log(
    `[Balance Check] ⚠️ Timeout after ${elapsed}s. Received: ${received.toFixed(
      6
    )} USDC, Expected: ${expectedAmount} USDC`
  );

  return {
    success: false,
    finalBalance: finalBalance,
    received: received,
    error: `Timeout: Only received ${received.toFixed(
      6
    )} USDC, expected ${expectedAmount} USDC`,
  };
}
