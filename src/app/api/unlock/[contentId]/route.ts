import { NextRequest, NextResponse } from "next/server";
import { createFacilitatorConfig } from "@coinbase/x402";
import { exact } from "x402/schemes";
import { useFacilitator } from "x402/verify";
import {
  executeBridgeWithCDP,
  getFacilitatorAddress,
  getFacilitatorBalance,
} from "@/lib/cdp/server-wallet";

export const runtime = "nodejs";

// Content database with seller network info
interface ContentItem {
  title: string;
  data: string;
  price: string;
  sellerNetwork: "base" | "solana";
  sellerAddress: string; // Address to receive payment
}

const CONTENT: Record<string, ContentItem> = {
  "premium-track-1": {
    title: "Track Premium",
    data: "https://example.com/audio/premium-track.mp3",
    price: "$0.10", // CCTP minimum is ~$1 USDC for cross-chain transfers
    sellerNetwork: "solana", // Seller wants to receive on Solana
    sellerAddress: "6Kseo7s41VPyaFJUTYeiNDmtZXftKkcmXqHV8qWUajL4", // Solana address
  },
  "album-access": {
    title: "Álbum Completo",
    data: "https://example.com/album/complete",
    price: "$2.00",
    sellerNetwork: "base",
    sellerAddress: "0x8AdB648bB68c1Ea15Ec5d510Da8D374A6Cb9b447", // Base address
  },
};

// Dynamic facilitator wallet - cached
let FACILITATOR_WALLET: string | null = null;

async function getFacilitatorWallet(): Promise<string> {
  if (FACILITATOR_WALLET) return FACILITATOR_WALLET;
  try {
    FACILITATOR_WALLET = await getFacilitatorAddress();
    console.log("[x402] Facilitator:", FACILITATOR_WALLET);
  } catch (error) {
    console.error("[x402] CDP error, using fallback:", error);
    FACILITATOR_WALLET =
      process.env.RESOURCE_WALLET_ADDRESS ||
      "0x8AdB648bB68c1Ea15Ec5d510Da8D374A6Cb9b447";
  }
  return FACILITATOR_WALLET;
}

// Configure x402 facilitator with CDP credentials
const facilitator = createFacilitatorConfig(
  process.env.CDP_API_KEY_ID!,
  process.env.CDP_API_KEY_SECRET!
);
// eslint-disable-next-line react-hooks/rules-of-hooks
const { verify, settle } = useFacilitator(facilitator);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const { contentId } = await params;
  const content = CONTENT[contentId];

  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  // Check for x402 payment header (X-PAYMENT is standard)
  const paymentHeader = request.headers.get("X-PAYMENT");

  if (!paymentHeader) {
    // Get facilitator wallet address (from CDP Server Wallet)
    const facilitatorAddress = await getFacilitatorWallet();

    // Return 402 Payment Required
    // Payment goes to FACILITATOR (on Base), who then bridges to seller
    const priceInCents = parseFloat(content.price.replace("$", "")) * 1000000; // Convert to 6 decimals USDC

    const paymentRequirements = {
      scheme: "exact" as const,
      network: "base" as const,
      maxAmountRequired: Math.floor(priceInCents).toString(),
      resource: request.url,
      description: `Unlock: ${content.title}`,
      mimeType: "application/json",
      payTo: facilitatorAddress as `0x${string}`,
      maxTimeoutSeconds: 300,
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
      // EIP-712 domain info for USDC on Base
      extra: {
        name: "USD Coin",
        version: "2",
        chainId: 8453,
        verifyingContract:
          "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
      },
    };

    return NextResponse.json(
      {
        x402Version: 1,
        error: "Payment required",
        accepts: [paymentRequirements],
      },
      { status: 402 }
    );
  }

  // Verify and settle payment
  try {
    // Decode payment using x402 scheme
    const decodedPayment = exact.evm.decodePayment(paymentHeader);
    decodedPayment.x402Version = 1;

    console.log(
      "[x402 Server] Decoded payment:",
      JSON.stringify(decodedPayment, null, 2)
    );

    // Build payment requirements for verification (same as 402 response)
    const facilitatorWallet = await getFacilitatorWallet();
    const priceInCents = parseFloat(content.price.replace("$", "")) * 1000000;

    const paymentRequirementsForVerify = {
      scheme: "exact" as const,
      network: "base" as const,
      maxAmountRequired: Math.floor(priceInCents).toString(),
      resource: request.url,
      description: `Unlock: ${content.title}`,
      mimeType: "application/json",
      payTo: facilitatorWallet as `0x${string}`,
      maxTimeoutSeconds: 300,
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
      extra: {
        name: "USD Coin",
        version: "2",
        chainId: 8453,
        verifyingContract:
          "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
      },
    };

    console.log("[x402 Server] Verifying payment...");

    // Verify payment
    const verification = await verify(
      decodedPayment,
      paymentRequirementsForVerify
    );

    if (!verification.isValid) {
      console.log("[x402 Server] Payment invalid:", verification.invalidReason);
      return NextResponse.json(
        {
          x402Version: 1,
          error: verification.invalidReason,
          accepts: [paymentRequirementsForVerify],
        },
        { status: 402 }
      );
    }

    console.log("[x402 Server] Payment verified! ✓");

    // Settle the payment
    const settlement = await settle(
      decodedPayment,
      paymentRequirementsForVerify
    );

    if (!settlement.success) {
      console.error("[x402 Server] Settlement failed");
      return NextResponse.json(
        {
          x402Version: 1,
          error: "Settlement failed",
          accepts: [paymentRequirementsForVerify],
        },
        { status: 402 }
      );
    }

    console.log(
      "[x402 Server] Payment settled! ✓ Transaction:",
      settlement.transaction
    );

    // Step 3: If seller is on Solana, execute bridge CCTP
    let bridgeResult: {
      success: boolean;
      txHash?: string;
      error?: string;
    } | null = null;

    if (content.sellerNetwork === "solana") {
      console.log("[x402] Bridge needed: Base -> Solana");

      // Wait for settlement to propagate
      await new Promise((r) => setTimeout(r, 3000));

      const balance = await getFacilitatorBalance();
      const { getFacilitatorEthBalance } = await import(
        "@/lib/cdp/server-wallet"
      );
      const ethBalance = await getFacilitatorEthBalance();
      console.log("[x402] Facilitator balance:", balance, "USDC");
      console.log("[x402] Facilitator ETH balance:", ethBalance, "ETH");

      // Execute complete bridge (includes attestation wait)
      const result = await executeBridgeWithCDP(
        content.price.replace("$", ""),
        content.sellerAddress
      );

      if (result.success) {
        console.log("[x402] ✅ Bridge completed:", result.txHash);
        bridgeResult = {
          success: true,
          txHash: result.txHash,
        };
      } else {
        console.log("[x402] ❌ Bridge failed:", result.error);
        bridgeResult = {
          success: false,
          error: result.error,
        };
      }
    }

    // Payment verified! Return the content
    return NextResponse.json({
      success: true,
      content: {
        id: contentId,
        title: content.title,
        data: content.data,
        unlockedAt: new Date().toISOString(),
      },
      payment: {
        verified: true,
        transaction: settlement.transaction,
      },
      bridge: bridgeResult
        ? {
            executed: true,
            success: bridgeResult.success,
            txHash: bridgeResult.txHash,
            error: bridgeResult.error,
            message: bridgeResult.success
              ? "Bridge completed successfully. USDC has been transferred to Solana."
              : undefined,
          }
        : null,
    });
  } catch (error) {
    console.error("[x402 Server] Payment processing error:", error);
    return NextResponse.json(
      { error: "Payment processing failed", details: String(error) },
      { status: 500 }
    );
  }
}
