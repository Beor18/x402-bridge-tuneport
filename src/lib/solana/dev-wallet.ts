/**
 * Solana Dev Wallet - Automatic claim and transfer
 * Similar to CDP Server Wallet but for Solana
 *
 * This wallet automatically:
 * 1. Claims USDC from CCTP bridge (receiveMessage)
 * 2. Transfers USDC to the seller's wallet
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { getMessageAndAttestation, pollForAttestation } from "./cctp-claim";
import { SOLANA_MAINNET } from "@/lib/cctp/constants";

const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=fc2a2d0a-fc68-4801-bd64-3e56031e4838";

// Dev wallet address (must match the one used in bridge)
const DEV_WALLET_ADDRESS = "6Kseo7s41VPyaFJUTYeiNDmtZXftKkcmXqHV8qWUajL4";

// USDC Mint on Solana Mainnet
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/**
 * Get dev wallet keypair from private key in env
 * Private key should be base58 encoded or array of numbers
 */
function getDevWalletKeypair(): Keypair {
  const privateKey = process.env.SOLANA_DEV_WALLET_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error(
      "SOLANA_DEV_WALLET_PRIVATE_KEY environment variable is required"
    );
  }

  try {
    // Try to parse as base58 string
    if (privateKey.length > 0) {
      // If it's a JSON array string, parse it
      if (privateKey.startsWith("[")) {
        const secretKey = JSON.parse(privateKey);
        return Keypair.fromSecretKey(Uint8Array.from(secretKey));
      } else {
        // Try as base58
        const { decode } = require("bs58");
        const secretKey = decode(privateKey);
        return Keypair.fromSecretKey(secretKey);
      }
    }
  } catch (error) {
    throw new Error(
      `Invalid SOLANA_DEV_WALLET_PRIVATE_KEY format: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  throw new Error("Could not parse dev wallet private key");
}

/**
 * Automatically claim USDC on Solana using message and attestation
 * This is server-side execution using the dev wallet
 */
export async function autoClaimUsdcOnSolana(
  txHash: string,
  recipientAddress: string = DEV_WALLET_ADDRESS
): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
}> {
  try {
    console.log("[Solana Dev Wallet] Auto-claiming USDC...");
    console.log("[Solana Dev Wallet] Bridge TX:", txHash);
    console.log(
      "[Solana Dev Wallet] Recipient (dev wallet):",
      recipientAddress
    );

    const connection = new Connection(SOLANA_RPC_URL, "confirmed");
    const devWallet = getDevWalletKeypair();

    // Verify dev wallet address matches
    if (devWallet.publicKey.toBase58() !== recipientAddress) {
      throw new Error(
        `Dev wallet address mismatch: expected ${recipientAddress}, got ${devWallet.publicKey.toBase58()}`
      );
    }

    // Poll for message and attestation
    console.log("[Solana Dev Wallet] Polling for attestation...");
    const messageData = await pollForAttestation(
      txHash,
      60, // maxAttempts: 5 minutes with 5s interval
      5000 // pollInterval: 5 seconds
    );

    if (!messageData || !messageData.attestation) {
      return {
        success: false,
        error: "Attestation not available yet. Please try again later.",
      };
    }

    console.log("[Solana Dev Wallet] Attestation received! Executing claim...");

    // Import executeClaimUsdcOnSolana logic but run it server-side
    const { executeClaimUsdcOnSolana } = await import("./cctp-claim");

    // Create a server-side signAndSendTransaction function
    const signAndSendTransaction = async (params: {
      transaction: Transaction;
    }) => {
      const transaction = params.transaction;

      // Set fee payer
      transaction.feePayer = devWallet.publicKey;

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;

      // Sign transaction
      transaction.sign(devWallet);

      // Send and confirm
      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          maxRetries: 3,
        }
      );

      // Wait for confirmation
      await connection.confirmTransaction(signature, "confirmed");

      return { signature };
    };

    // Execute claim
    const result = await executeClaimUsdcOnSolana(
      messageData.message,
      messageData.attestation,
      recipientAddress,
      signAndSendTransaction
    );

    if (result.success) {
      console.log(
        "[Solana Dev Wallet] ✅ USDC claimed! Signature:",
        result.signature
      );
    }

    return result;
  } catch (error: any) {
    console.error("[Solana Dev Wallet] Error auto-claiming:", error);
    return {
      success: false,
      error: error.message || "Failed to auto-claim USDC on Solana",
    };
  }
}

/**
 * Transfer USDC from dev wallet to seller wallet
 */
export async function transferUsdcToSeller(
  sellerAddress: string,
  amount: number
): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
}> {
  try {
    console.log(
      `[Solana Dev Wallet] Transferring ${amount} USDC to seller: ${sellerAddress}`
    );

    const connection = new Connection(SOLANA_RPC_URL, "confirmed");
    const devWallet = getDevWalletKeypair();
    const usdcMint = new PublicKey(USDC_MINT);
    const sellerPubkey = new PublicKey(sellerAddress);

    // Get token accounts
    const devTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      devWallet.publicKey
    );
    const sellerTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      sellerPubkey
    );

    console.log(
      "[Solana Dev Wallet] Dev token account:",
      devTokenAccount.toBase58()
    );
    console.log(
      "[Solana Dev Wallet] Seller token account:",
      sellerTokenAccount.toBase58()
    );

    // Check dev wallet balance
    try {
      const devAccount = await getAccount(connection, devTokenAccount);
      const balance = Number(devAccount.amount) / 1e6;
      console.log(`[Solana Dev Wallet] Current balance: ${balance} USDC`);

      if (balance < amount) {
        return {
          success: false,
          error: `Insufficient balance: ${balance} USDC, need ${amount} USDC`,
        };
      }
    } catch (error) {
      console.error("[Solana Dev Wallet] Error checking balance:", error);
      return {
        success: false,
        error: "Could not check dev wallet balance",
      };
    }

    // Create transfer instruction
    const amountRaw = BigInt(Math.floor(amount * 1e6)); // USDC has 6 decimals

    const transferInstruction = createTransferInstruction(
      devTokenAccount, // source
      sellerTokenAccount, // destination
      devWallet.publicKey, // owner
      amountRaw, // amount
      [], // multiSigners
      TOKEN_PROGRAM_ID
    );

    // Create transaction
    const transaction = new Transaction().add(transferInstruction);

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = devWallet.publicKey;

    // Sign and send
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [devWallet],
      {
        commitment: "confirmed",
      }
    );

    console.log(
      "[Solana Dev Wallet] ✅ Transfer completed! Signature:",
      signature
    );
    console.log(
      `[Solana Dev Wallet] View on Solscan: https://solscan.io/tx/${signature}`
    );

    return {
      success: true,
      signature,
    };
  } catch (error: any) {
    console.error("[Solana Dev Wallet] Error transferring USDC:", error);
    return {
      success: false,
      error: error.message || "Failed to transfer USDC to seller",
    };
  }
}

/**
 * Complete flow: Auto-claim USDC from bridge and transfer to seller
 */
export async function autoClaimAndTransferToSeller(
  txHash: string,
  sellerAddress: string,
  amount: number
): Promise<{
  success: boolean;
  claimSignature?: string;
  transferSignature?: string;
  error?: string;
}> {
  try {
    console.log(`[Solana Dev Wallet] Starting auto-claim and transfer flow...`);
    console.log(`[Solana Dev Wallet] Bridge TX: ${txHash}`);
    console.log(`[Solana Dev Wallet] Seller: ${sellerAddress}`);
    console.log(`[Solana Dev Wallet] Amount: ${amount} USDC`);

    // Step 1: Auto-claim USDC to dev wallet
    const claimResult = await autoClaimUsdcOnSolana(txHash, DEV_WALLET_ADDRESS);

    if (!claimResult.success) {
      return {
        success: false,
        error: `Claim failed: ${claimResult.error}`,
      };
    }

    console.log(
      `[Solana Dev Wallet] Claim successful! Waiting for confirmation...`
    );
    // Wait a bit for transaction to settle
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 2: Transfer USDC to seller
    const transferResult = await transferUsdcToSeller(sellerAddress, amount);

    if (!transferResult.success) {
      return {
        success: false,
        claimSignature: claimResult.signature,
        error: `Transfer failed: ${transferResult.error}`,
      };
    }

    console.log(`[Solana Dev Wallet] ✅ Complete flow successful!`);
    console.log(`[Solana Dev Wallet] Claim TX: ${claimResult.signature}`);
    console.log(`[Solana Dev Wallet] Transfer TX: ${transferResult.signature}`);

    return {
      success: true,
      claimSignature: claimResult.signature,
      transferSignature: transferResult.signature,
    };
  } catch (error: any) {
    console.error("[Solana Dev Wallet] Error in complete flow:", error);
    return {
      success: false,
      error: error.message || "Failed to complete auto-claim and transfer",
    };
  }
}
