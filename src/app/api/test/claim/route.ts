/**
 * API Route: Test CCTP Claim on Solana
 *
 * This endpoint fetches the message and attestation from Circle's API
 * using the transaction hash from the bridge burn step.
 */

import { NextRequest, NextResponse } from "next/server";
import { prepareClaimUsdcOnSolana } from "@/lib/solana/cctp-claim";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { txHash, maxAttempts, pollInterval } = body;

    if (!txHash) {
      return NextResponse.json(
        {
          success: false,
          error: "Transaction hash (txHash) is required",
        },
        { status: 400 }
      );
    }

    console.log("[TEST CLAIM API] Received request:", {
      txHash,
      maxAttempts: maxAttempts || "default (120)",
      pollInterval: pollInterval || "default (2000ms)",
    });

    // Prepare the claim (fetch message and attestation)
    const result = await prepareClaimUsdcOnSolana(
      txHash,
      maxAttempts,
      pollInterval
    );

    if (result.success) {
      console.log(
        "[TEST CLAIM API] ✓ Message and attestation retrieved successfully"
      );
      return NextResponse.json({
        success: true,
        message: result.message,
        attestation: result.attestation,
        decodedMessage: result.decodedMessage,
      });
    } else {
      console.error("[TEST CLAIM API] Failed to prepare claim:", result.error);
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[TEST CLAIM API] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
