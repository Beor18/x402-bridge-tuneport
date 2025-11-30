/**
 * CCTP Solana Claim - Reclaim USDC on Solana using attestation
 *
 * This module handles the final step of CCTP bridge: minting USDC on Solana
 * using the attestation received from Circle's API.
 *
 * Note: This implementation requires the Bridge Kit SDK from Circle for production.
 * For now, this provides the structure to fetch message and attestation.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  SOLANA_MAINNET,
  CIRCLE_ATTESTATION_API,
  BASE_MAINNET,
} from "@/lib/cctp/constants";

// Better RPC endpoint for Solana (with better rate limits)
const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || SOLANA_MAINNET.rpcUrl;
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";

// CCTP V2 Solana Program Addresses (Mainnet)
// Source: https://developers.circle.com/cctp/solana-programs
export const MESSAGE_TRANSMITTER_PROGRAM =
  "CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd";
export const TOKEN_MESSENGER_MINTER_PROGRAM =
  "CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3";

// USDC Mint on Solana Mainnet
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/**
 * Get message and attestation from Circle API using transaction hash
 */
export async function getMessageAndAttestation(txHash: string): Promise<{
  message: string;
  attestation: string;
  decodedMessage?: any;
} | null> {
  try {
    console.log(
      "[Solana CCTP] Fetching message and attestation for tx:",
      txHash
    );

    const apiBaseUrl = CIRCLE_ATTESTATION_API.v2.messages.mainnet;
    const sourceDomainId = BASE_MAINNET.domain; // Base domain = 6

    const response = await fetch(
      `${apiBaseUrl}/${sourceDomainId}?transactionHash=${txHash}`
    );

    if (!response.ok) {
      console.error(
        "[Solana CCTP] Failed to fetch message:",
        response.status,
        response.statusText
      );
      return null;
    }

    const data = await response.json();

    if (data.messages && data.messages.length > 0) {
      const message = data.messages[0];

      // Check if attestation is ready
      if (message.attestation && message.status === "complete") {
        console.log("[Solana CCTP] ✓ Message and attestation found!");
        return {
          message: message.message,
          attestation: message.attestation,
          decodedMessage: message.decodedMessage,
        };
      } else {
        console.log(
          "[Solana CCTP] Message found but attestation not ready yet. Status:",
          message.status
        );
        return null;
      }
    } else {
      console.log("[Solana CCTP] No messages found for this transaction");
      return null;
    }
  } catch (error: any) {
    console.error("[Solana CCTP] Error fetching message:", error.message);
    return null;
  }
}

/**
 * Convert hex string to Buffer
 */
function hexToBuffer(hex: string): Buffer {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Buffer.from(cleanHex, "hex");
}

/**
 * Poll for message and attestation until ready
 *
 * This function polls Circle's API until the attestation is ready
 */
export async function pollForAttestation(
  txHash: string,
  maxAttempts: number = 120,
  pollInterval: number = 2000
): Promise<{
  message: string;
  attestation: string;
  decodedMessage?: any;
} | null> {
  console.log("[Solana CCTP] Polling for attestation...");
  console.log("[Solana CCTP] Transaction hash:", txHash);

  let attempts = 0;
  const logInterval = 10; // Log every 10 attempts

  while (attempts < maxAttempts) {
    const messageData = await getMessageAndAttestation(txHash);

    if (messageData) {
      console.log(
        `[Solana CCTP] ✓ Attestation ready after ${attempts} attempts`
      );
      return messageData;
    }

    if (attempts % logInterval === 0 && attempts > 0) {
      const elapsed = (attempts * pollInterval) / 1000;
      const minutes = Math.floor(elapsed / 60);
      const seconds = Math.floor(elapsed % 60);
      console.log(
        `[Solana CCTP] Still waiting for attestation... (${minutes}m ${seconds}s elapsed)`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    attempts++;
  }

  console.log(
    `[Solana CCTP] ⚠️  Attestation timeout after ${maxAttempts} attempts`
  );
  return null;
}

/**
 * Claim USDC on Solana
 *
 * This function fetches the message and attestation from Circle's API
 * and returns them ready for the client-side claim using Bridge Kit SDK or Privy wallet
 */
export async function prepareClaimUsdcOnSolana(
  txHash: string,
  maxAttempts?: number,
  pollInterval?: number
): Promise<{
  success: boolean;
  message?: string;
  attestation?: string;
  decodedMessage?: any;
  error?: string;
}> {
  try {
    console.log("[Solana CCTP] Preparing USDC claim...");
    console.log("[Solana CCTP] Transaction hash:", txHash);

    // Poll for attestation (with shorter timeout for Fast Transfer)
    const messageData = await pollForAttestation(
      txHash,
      maxAttempts,
      pollInterval
    );

    if (!messageData) {
      return {
        success: false,
        error:
          "Message or attestation not found. The bridge may still be processing. Please wait a few minutes and try again.",
      };
    }

    console.log("[Solana CCTP] ✓ Message and attestation ready for claim");

    return {
      success: true,
      message: messageData.message,
      attestation: messageData.attestation,
      decodedMessage: messageData.decodedMessage,
    };
  } catch (error: any) {
    console.error("[Solana CCTP] Error preparing claim:", error.message);
    return {
      success: false,
      error: error.message || "Failed to prepare USDC claim on Solana",
    };
  }
}

/**
 * Derive MessageTransmitter message account
 */
function deriveMessageAccount(
  messageHash: Buffer,
  programId: PublicKey
): PublicKey {
  const [messageAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("message"), messageHash],
    programId
  );
  return messageAccount;
}

/**
 * Derive TokenMessengerMinter token pair account
 */
function deriveTokenPairAccount(
  mint: PublicKey,
  programId: PublicKey
): PublicKey {
  const [tokenPairAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_pair"), mint.toBuffer()],
    programId
  );
  return tokenPairAccount;
}

/**
 * Derive TokenMessengerMinter token messenger account
 */
function deriveTokenMessengerAccount(programId: PublicKey): PublicKey {
  const [tokenMessengerAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_messenger")],
    programId
  );
  return tokenMessengerAccount;
}

/**
 * Create receiveMessage instruction for CCTP Solana
 */
function createReceiveMessageInstruction(
  messageBytes: Buffer,
  attestationBytes: Buffer,
  recipientPubkey: PublicKey,
  associatedTokenAccount: PublicKey,
  messageTransmitterProgram: PublicKey,
  tokenMessengerMinterProgram: PublicKey,
  usdcMint: PublicKey
): any {
  // Derive accounts needed for receiveMessage
  const tokenMessengerAccount = deriveTokenMessengerAccount(
    tokenMessengerMinterProgram
  );

  // For message account, we need to hash the message first
  // CCTP uses keccak256 hash of the message
  const { createHash } = require("crypto");
  const messageHash = createHash("sha256").update(messageBytes).digest();
  const messageAccount = deriveMessageAccount(
    messageHash,
    messageTransmitterProgram
  );

  const tokenPairAccount = deriveTokenPairAccount(
    usdcMint,
    tokenMessengerMinterProgram
  );

  // Build instruction data
  // CCTP receiveMessage instruction format: [instruction_discriminator(8), message_bytes, attestation_bytes]
  // Instruction discriminator for receiveMessage in MessageTransmitter is typically the first 8 bytes of sha256("global:receive_message")
  const instructionData = Buffer.concat([messageBytes, attestationBytes]);

  // Build accounts for the instruction
  // Order matters - must match the program's account layout
  const accounts = [
    { pubkey: messageAccount, isSigner: false, isWritable: true },
    { pubkey: messageTransmitterProgram, isSigner: false, isWritable: false },
    { pubkey: tokenMessengerMinterProgram, isSigner: false, isWritable: false },
    { pubkey: tokenMessengerAccount, isSigner: false, isWritable: true },
    { pubkey: tokenPairAccount, isSigner: false, isWritable: true },
    { pubkey: usdcMint, isSigner: false, isWritable: false },
    { pubkey: associatedTokenAccount, isSigner: false, isWritable: true },
    { pubkey: recipientPubkey, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];

  return {
    programId: tokenMessengerMinterProgram,
    keys: accounts,
    data: instructionData,
  };
}

/**
 * Execute claim USDC on Solana using message and attestation
 *
 * This function creates and sends the receiveMessage transaction to CCTP programs on Solana
 * Note: This is a client-side function that requires a Solana wallet provider (e.g., Privy)
 */
export async function executeClaimUsdcOnSolana(
  message: string,
  attestation: string,
  recipientAddress: string,
  signAndSendTransaction: (params: {
    transaction: Transaction;
  }) => Promise<{ signature: string }>
): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
}> {
  try {
    console.log("[Solana CCTP] Executing USDC claim...");
    console.log("[Solana CCTP] Recipient:", recipientAddress);

    const recipientPubkey = new PublicKey(recipientAddress);
    const messageTransmitterProgram = new PublicKey(
      MESSAGE_TRANSMITTER_PROGRAM
    );
    const tokenMessengerMinterProgram = new PublicKey(
      TOKEN_MESSENGER_MINTER_PROGRAM
    );
    const usdcMint = new PublicKey(USDC_MINT);

    // Convert hex strings to buffers
    const messageBytes = hexToBuffer(message);
    const attestationBytes = hexToBuffer(attestation);

    console.log("[Solana CCTP] Message bytes length:", messageBytes.length);
    console.log(
      "[Solana CCTP] Attestation bytes length:",
      attestationBytes.length
    );

    // Get or create associated token account for USDC
    const associatedTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      recipientPubkey
    );

    console.log(
      "[Solana CCTP] Associated Token Account:",
      associatedTokenAccount.toBase58()
    );

    // Note: Token account verification skipped to avoid RPC rate limits
    // The CCTP program will create it if needed during receiveMessage

    // Create the receiveMessage instruction
    const receiveMessageIx = createReceiveMessageInstruction(
      messageBytes,
      attestationBytes,
      recipientPubkey,
      associatedTokenAccount,
      messageTransmitterProgram,
      tokenMessengerMinterProgram,
      usdcMint
    );

    // Create transaction
    const transaction = new Transaction();

    // Add the receiveMessage instruction
    transaction.add({
      programId: receiveMessageIx.programId,
      keys: receiveMessageIx.keys.map((key: any) => ({
        pubkey: key.pubkey,
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      })),
      data: Buffer.from(receiveMessageIx.data),
    });

    // Set fee payer (blockhash will be fetched by Privy when sending)
    transaction.feePayer = recipientPubkey;

    console.log("[Solana CCTP] Transaction prepared, signing and sending...");

    // Sign and send transaction (Privy will handle blockhash and RPC internally)
    const result = await signAndSendTransaction({ transaction });

    console.log("[Solana CCTP] ✓ Transaction sent:", result.signature);
    console.log(
      `[Solana CCTP] View on Solscan: https://solscan.io/tx/${result.signature}`
    );

    // Transaction sent successfully via Privy
    // Privy handles confirmation internally - no need to wait here
    return {
      success: true,
      signature: result.signature,
    };
  } catch (error: any) {
    console.error("[Solana CCTP] Error executing claim:", error);
    return {
      success: false,
      error: error.message || "Failed to execute USDC claim on Solana",
    };
  }
}
