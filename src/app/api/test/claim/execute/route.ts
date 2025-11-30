/**
 * API Route: Execute CCTP Claim on Solana
 *
 * This endpoint executes the receiveMessage call on Solana CCTP programs
 * to mint USDC using the message and attestation provided.
 */

import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  MESSAGE_TRANSMITTER_PROGRAM,
  TOKEN_MESSENGER_MINTER_PROGRAM,
  USDC_MINT,
} from "@/lib/solana/cctp-claim";

/**
 * Convert hex string to Buffer
 */
function hexToBuffer(hex: string): Buffer {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Buffer.from(cleanHex, "hex");
}

/**
 * Note: This endpoint currently returns instructions for client-side execution
 * The actual claim must be executed client-side because it requires wallet signing
 *
 * TODO: Implement server-side claim using Bridge Kit SDK with Solana adapter
 * This would require setting up a Solana adapter on the server with a keypair
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, attestation, recipientAddress } = body;

    if (!message || !attestation || !recipientAddress) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required fields: message, attestation, and recipientAddress",
        },
        { status: 400 }
      );
    }

    console.log("[EXECUTE CLAIM API] Received claim request");
    console.log("[EXECUTE CLAIM API] Recipient:", recipientAddress);

    // Validate addresses
    try {
      new PublicKey(recipientAddress);
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid recipient address format",
        },
        { status: 400 }
      );
    }

    const recipientPubkey = new PublicKey(recipientAddress);
    const usdcMint = new PublicKey(USDC_MINT);
    const messageTransmitterProgram = new PublicKey(
      MESSAGE_TRANSMITTER_PROGRAM
    );
    const tokenMessengerMinterProgram = new PublicKey(
      TOKEN_MESSENGER_MINTER_PROGRAM
    );

    // Get associated token account
    const associatedTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      recipientPubkey
    );

    // Convert hex to buffers
    const messageBytes = hexToBuffer(message);
    const attestationBytes = hexToBuffer(attestation);

    console.log(
      "[EXECUTE CLAIM API] Message bytes length:",
      messageBytes.length
    );
    console.log(
      "[EXECUTE CLAIM API] Attestation bytes length:",
      attestationBytes.length
    );
    console.log(
      "[EXECUTE CLAIM API] Token account:",
      associatedTokenAccount.toBase58()
    );

    // Return information needed for client-side execution
    // The actual transaction construction and signing must happen client-side
    return NextResponse.json({
      success: true,
      message: "Claim ready for client-side execution",
      instructionData: {
        messageTransmitterProgram: MESSAGE_TRANSMITTER_PROGRAM,
        tokenMessengerMinterProgram: TOKEN_MESSENGER_MINTER_PROGRAM,
        usdcMint: USDC_MINT,
        recipientAddress,
        associatedTokenAccount: associatedTokenAccount.toBase58(),
        messageLength: messageBytes.length,
        attestationLength: attestationBytes.length,
      },
      note: "Use Bridge Kit SDK on client-side with Privy wallet to execute receiveMessage",
    });
  } catch (error: any) {
    console.error("[EXECUTE CLAIM API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
