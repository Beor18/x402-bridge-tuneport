import { NextRequest, NextResponse } from "next/server";
import { executeBridgeWithCDP } from "@/lib/cdp/server-wallet";

/**
 * Test endpoint for direct bridge execution
 * POST /api/test/bridge
 * Body: { amount: string, solanaRecipient: string, useFastTransfer?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, solanaRecipient, useFastTransfer = true } = body;

    // Validate inputs
    if (!amount || !solanaRecipient) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: amount and solanaRecipient",
        },
        { status: 400 }
      );
    }

    // Validate amount is a number
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Amount must be a positive number",
        },
        { status: 400 }
      );
    }

    console.log("[TEST BRIDGE] Starting bridge test...");
    console.log("[TEST BRIDGE] Amount:", amount, "USDC");
    console.log("[TEST BRIDGE] Recipient:", solanaRecipient);
    console.log("[TEST BRIDGE] Fast Transfer:", useFastTransfer);

    // Execute bridge
    const result = await executeBridgeWithCDP(amount, solanaRecipient, {
      useFastTransfer,
    });

    console.log("[TEST BRIDGE] Bridge result:", result);

    if (result.success) {
      return NextResponse.json({
        success: true,
        txHash: result.txHash,
        error: result.error, // May contain warning messages
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Bridge failed",
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[TEST BRIDGE] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
