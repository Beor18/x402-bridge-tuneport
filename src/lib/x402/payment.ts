/**
 * x402 Payment utilities
 * For paying to unlock content from Base or Solana
 */

import { type Hex, parseUnits, encodeFunctionData } from "viem";

// x402 Facilitator URLs
export const X402_FACILITATOR = {
  testnet: "https://x402.org/facilitator",
  mainnet: "https://api.cdp.coinbase.com/platform/v2/x402",
} as const;

export interface PaymentRequirements {
  x402Version: number;
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: string;
  asset: string;
}

export interface X402PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: string;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
}

/**
 * Create EIP-712 typed data for USDC authorization
 * Note: Uses strings/numbers instead of BigInt for JSON serialization compatibility
 */
export function createTransferAuthorizationTypedData(
  from: string,
  to: string,
  amount: string, // Can be decimal ("0.10") or smallest unit ("100000")
  usdcAddress: string,
  chainId: number
) {
  // If amount looks like it's already in smallest unit (no decimal point and > 1000), use as-is
  // Otherwise, convert from decimal
  const amountWei =
    amount.includes(".") || parseFloat(amount) < 1000
      ? parseUnits(amount, 6)
      : BigInt(amount);

  const validAfter = 0;
  const validBefore = Math.floor(Date.now() / 1000) + 3600;
  const nonce = `0x${crypto
    .getRandomValues(new Uint8Array(32))
    .reduce((s, b) => s + b.toString(16).padStart(2, "0"), "")}`;

  return {
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: chainId, // number, not BigInt
      verifyingContract: usdcAddress as Hex,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: from as Hex,
      to: to as Hex,
      value: amountWei.toString(), // string for JSON
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce: nonce as Hex,
    },
  };
}

/**
 * Build x402 payment payload from signed authorization
 */
export function buildPaymentPayload(
  signature: Hex,
  authorization: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: Hex;
  },
  network: string
): string {
  const payload: X402PaymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network,
    payload: {
      signature,
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value,
        validAfter: authorization.validAfter,
        validBefore: authorization.validBefore,
        nonce: authorization.nonce,
      },
    },
  };

  return JSON.stringify(payload);
}

/**
 * Parse 402 response to get payment requirements
 */
export function parsePaymentRequirements(
  response: Response
): PaymentRequirements | null {
  const requirementsHeader = response.headers.get("X-Payment-Requirements");
  if (!requirementsHeader) return null;

  try {
    return JSON.parse(requirementsHeader);
  } catch {
    return null;
  }
}

/**
 * Make a request with x402 payment
 */
export async function fetchWithPayment(
  url: string,
  signTypedData: (params: any) => Promise<Hex>,
  walletAddress: string,
  network: "base" | "base-sepolia" | "solana" | "solana-devnet",
  options: RequestInit = {}
): Promise<Response> {
  console.log("[x402] Starting payment flow for:", url);

  // First request - get payment requirements
  const initialResponse = await fetch(url, options);
  console.log("[x402] Initial response status:", initialResponse.status);

  if (initialResponse.status !== 402) {
    return initialResponse;
  }

  // Parse payment requirements
  const requirements = parsePaymentRequirements(initialResponse);
  console.log("[x402] Payment requirements:", requirements);

  if (!requirements) {
    throw new Error("Invalid payment requirements");
  }

  // Determine chain config based on network
  const isEvm = network === "base" || network === "base-sepolia";

  if (!isEvm) {
    throw new Error("Solana x402 payment requires different implementation");
  }

  // Get USDC address and chain ID
  const usdcAddress =
    network === "base"
      ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
      : "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const chainId = network === "base" ? 8453 : 84532;

  // Create typed data for signing
  const typedData = createTransferAuthorizationTypedData(
    walletAddress,
    requirements.payTo,
    requirements.maxAmountRequired,
    usdcAddress,
    chainId
  );
  console.log("[x402] TypedData created, requesting signature...");

  // Sign the authorization
  try {
    const signature = await signTypedData(typedData);
    console.log("[x402] Signature received:", signature?.slice(0, 20) + "...");

    // Build payment payload
    const paymentPayload = buildPaymentPayload(
      signature,
      {
        from: typedData.message.from,
        to: typedData.message.to,
        value: typedData.message.value,
        validAfter: typedData.message.validAfter,
        validBefore: typedData.message.validBefore,
        nonce: typedData.message.nonce,
      },
      network
    );
    console.log("[x402] Payment payload built, sending...");

    // Retry with payment
    const paymentResponse = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "X-Payment": paymentPayload,
      },
    });
    console.log("[x402] Payment response status:", paymentResponse.status);

    // If still 402, log the error
    if (paymentResponse.status === 402) {
      const errorBody = await paymentResponse
        .clone()
        .json()
        .catch(() => null);
      console.error("[x402] Payment rejected:", errorBody);
    }

    return paymentResponse;
  } catch (error) {
    console.error("[x402] Signature error:", error);
    throw error;
  }
}
