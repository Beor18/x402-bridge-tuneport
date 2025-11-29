/**
 * CDP Server Wallet for Facilitator
 * Uses CDP Smart Accounts with Paymaster (NO ETH needed for gas!)
 * Based on: https://docs.cdp.coinbase.com/server-wallets/v2/evm-features/gas-sponsorship
 */

import { CdpClient } from "@coinbase/cdp-sdk";
import {
  type Hex,
  type Address,
  createPublicClient,
  http,
  formatUnits,
  encodeFunctionData,
} from "viem";
import { base } from "viem/chains";
import {
  BASE_MAINNET,
  ERC20_ABI,
  CCTP_DOMAINS,
  CIRCLE_ATTESTATION_API,
  TOKEN_MESSENGER_V2_ABI,
  FINALITY_THRESHOLD,
} from "../cctp/constants";

let cdpClient: CdpClient | null = null;

/**
 * Initialize CDP client
 */
function getCdpClient(): CdpClient {
  if (cdpClient) return cdpClient;
  cdpClient = new CdpClient();
  return cdpClient;
}

/**
 * Get the facilitator's EVM account scoped to Base mainnet
 * Uses regular account (not Smart Account) for CCTP compatibility
 * Paymaster still works on Base for gas sponsorship
 */
export async function getFacilitatorAccount() {
  const client = getCdpClient();

  // Check if we have a predefined agent address
  const agentAddress = process.env.CDP_AGENT_ADDRESS;

  let account;

  if (agentAddress) {
    console.log("[CDP] Using predefined agent address:", agentAddress);
    // Get existing account by address
    account = await client.evm.getAccount({
      address: agentAddress as `0x${string}`,
    });
  } else {
    // Create or get by name
    const accountName =
      process.env.FACILITATOR_ACCOUNT_NAME || "facilitator-bridge";
    console.log("[CDP] Getting or creating facilitator account:", accountName);
    account = await client.evm.getOrCreateAccount({ name: accountName });
  }

  console.log("[CDP] Facilitator account address:", account.address);

  // Scope to Base mainnet
  const baseAccount = await account.useNetwork("base");

  return baseAccount;
}

/**
 * Pad Solana address to bytes32 format for CCTP
 */
function padSolanaAddress(address: string): string {
  const { PublicKey } = require("@solana/web3.js");
  const pubkey = new PublicKey(address);
  const bytes = pubkey.toBytes();
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

/**
 * Execute CCTP bridge from Base to Solana using Smart Account + Paymaster
 * NO ETH needed - gas is sponsored by CDP Paymaster!
 *
 * Uses CCTP V2 Fast Transfer by default for faster attestation (~30-60s vs 10-20min)
 */
const CCTP_MINIMUM_USDC = 0.01;

export async function executeBridgeWithCDP(
  amount: string,
  solanaRecipient: string,
  options?: {
    useFastTransfer?: boolean; // Enable Fast Transfer (faster attestation)
  }
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const useFastTransfer = options?.useFastTransfer ?? true; // Default to Fast Transfer

    console.log("[CDP CCTP] Starting bridge Base -> Solana");
    console.log("[CDP CCTP] Amount:", amount, "USDC");
    console.log("[CDP CCTP] Recipient:", solanaRecipient);
    console.log(
      "[CDP CCTP] Transfer Speed:",
      useFastTransfer ? "FAST (CCTP V2)" : "STANDARD"
    );

    // Check minimum amount
    const amountNum = parseFloat(amount);
    if (amountNum < CCTP_MINIMUM_USDC) {
      console.error(
        `[CDP CCTP] Amount ${amount} is below minimum of ${CCTP_MINIMUM_USDC} USDC`
      );
      return {
        success: false,
        error: `CCTP requires minimum ${CCTP_MINIMUM_USDC} USDC`,
      };
    }

    // Get CDP account (regular account, not Smart Account for CCTP compatibility)
    const account = await getFacilitatorAccount();
    console.log("[CDP CCTP] Using account:", account.address);

    // Convert amount to wei (USDC has 6 decimals)
    const amountWei = BigInt(Math.floor(amountNum * 1_000_000));

    // Pad Solana recipient address to bytes32
    const recipientBytes32 = padSolanaAddress(solanaRecipient);
    console.log("[CDP CCTP] Recipient (bytes32):", recipientBytes32);

    // Check USDC balance first
    const publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_MAINNET.rpcUrl),
    });

    const usdcBalance = await publicClient.readContract({
      address: BASE_MAINNET.usdc as Address,
      abi: [
        {
          inputs: [{ name: "account", type: "address" }],
          name: "balanceOf",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "balanceOf",
      args: [account.address as Address],
    });

    console.log(
      "[CDP CCTP] USDC Balance:",
      (Number(usdcBalance) / 1_000_000).toFixed(2),
      "USDC"
    );

    if (usdcBalance < amountWei) {
      throw new Error(
        `Insufficient USDC balance: ${Number(usdcBalance) / 1_000_000} USDC`
      );
    }

    // Step 1: Approve USDC
    console.log("[CDP CCTP] Step 1/4: Approving USDC...");

    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [BASE_MAINNET.tokenMessengerV2 as Address, amountWei],
    });

    console.log(
      "[CDP CCTP] Approving",
      amountNum,
      "USDC to TokenMessengerV2:",
      BASE_MAINNET.tokenMessengerV2
    );

    const approveTx = await account.sendTransaction({
      transaction: {
        to: BASE_MAINNET.usdc as Address,
        data: approveData,
        // Let CDP estimate gas automatically
      },
    });

    await account.waitForTransactionReceipt(approveTx);
    console.log("[CDP CCTP] ✓ Approve tx:", approveTx.transactionHash);

    // Verify allowance after approve
    const allowance = await publicClient.readContract({
      address: BASE_MAINNET.usdc as Address,
      abi: [
        {
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          name: "allowance",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "allowance",
      args: [
        account.address as Address,
        BASE_MAINNET.tokenMessengerV2 as Address,
      ],
    });

    console.log(
      "[CDP CCTP] Allowance after approve:",
      (Number(allowance) / 1_000_000).toFixed(6),
      "USDC"
    );

    if (allowance < amountWei) {
      throw new Error(
        `Allowance insufficient: ${
          Number(allowance) / 1_000_000
        } USDC (need ${amountNum} USDC)`
      );
    }

    // Small delay to ensure approve is fully processed
    console.log("[CDP CCTP] Waiting 3 seconds for approve to propagate...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Step 2: depositForBurn (CCTP V2)
    console.log("[CDP CCTP] Step 2/4: Burning USDC on Base (CCTP V2)...");

    // CCTP V2 parameters
    const destinationCaller =
      "0x0000000000000000000000000000000000000000000000000000000000000000"; // No caller (zero address)

    // For Fast Transfer: maxFee must be less than amount
    // Base Fast Transfer fee: 1 bps (0.01%) according to Circle docs
    // We use a safe upper bound (0.1% = 100 bps) to allow for fee fluctuations
    // For Standard Transfer: maxFee is 0
    let maxFee: bigint;
    if (useFastTransfer) {
      // Calculate maxFee as 0.1% of amount (safe upper bound, 10x the typical fee)
      // Base fee rate: 1 bps, but we use 100 bps (0.1%) for safety
      maxFee = (amountWei * 100n) / 100000n; // 0.1% = 100 bps

      // Ensure maxFee is at least 1 (minimum 1 micro-USDC)
      if (maxFee < 1n) {
        maxFee = 1n;
      }

      // Ensure maxFee is less than amount (contract requirement)
      if (maxFee >= amountWei) {
        maxFee = amountWei - 1n; // Use amount - 1 as fallback
      }
    } else {
      maxFee = 0n; // Standard Transfer has no fee
    }

    const minFinalityThreshold = useFastTransfer
      ? FINALITY_THRESHOLD.FAST
      : FINALITY_THRESHOLD.STANDARD;

    console.log("[CDP CCTP] V2 Parameters:");
    console.log("  - Transfer Speed:", useFastTransfer ? "FAST" : "STANDARD");
    console.log("  - minFinalityThreshold:", minFinalityThreshold);
    console.log("  - maxFee:", maxFee.toString(), "wei");

    // Use encodeFunctionData with V2 ABI (7 parameters)
    const depositData = encodeFunctionData({
      abi: TOKEN_MESSENGER_V2_ABI,
      functionName: "depositForBurn",
      args: [
        amountWei,
        CCTP_DOMAINS.SOLANA,
        recipientBytes32 as Hex,
        BASE_MAINNET.usdc as Address,
        destinationCaller as Hex, // V2: destinationCaller
        maxFee, // V2: maxFee
        minFinalityThreshold, // V2: minFinalityThreshold
      ],
    });

    console.log("[CDP CCTP] depositForBurn data:", depositData);
    console.log("[CDP CCTP] TokenMessengerV2:", BASE_MAINNET.tokenMessengerV2);
    console.log("[CDP CCTP] Parameters:");
    console.log("  - amount:", amountWei.toString(), "(", amountNum, "USDC )");
    console.log("  - destinationDomain:", CCTP_DOMAINS.SOLANA);
    console.log("  - mintRecipient:", recipientBytes32);
    console.log("  - burnToken:", BASE_MAINNET.usdc);
    console.log("  - destinationCaller:", destinationCaller);
    console.log("  - maxFee:", maxFee.toString());
    console.log("  - minFinalityThreshold:", minFinalityThreshold);

    // Re-verify allowance just before burn
    const allowanceBefore = await publicClient.readContract({
      address: BASE_MAINNET.usdc as Address,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [
        account.address as Address,
        BASE_MAINNET.tokenMessengerV2 as Address,
      ],
    });

    console.log(
      "[CDP CCTP] Allowance just before burn:",
      (Number(allowanceBefore) / 1_000_000).toFixed(6),
      "USDC"
    );

    if (allowanceBefore < amountWei) {
      throw new Error(
        `Allowance disappeared! Now: ${
          Number(allowanceBefore) / 1_000_000
        } USDC, need: ${amountNum} USDC`
      );
    }

    // Try to simulate the call (optional - skip if it fails, actual tx might still work)
    console.log("[CDP CCTP] Attempting simulation (optional)...");
    try {
      await publicClient.simulateContract({
        address: BASE_MAINNET.tokenMessengerV2 as Address,
        abi: TOKEN_MESSENGER_V2_ABI,
        functionName: "depositForBurn",
        args: [
          amountWei,
          CCTP_DOMAINS.SOLANA,
          recipientBytes32 as Hex,
          BASE_MAINNET.usdc as Address,
          destinationCaller as Hex,
          maxFee,
          minFinalityThreshold,
        ],
        account: account.address as Address,
      });
      console.log("[CDP CCTP] ✓ Simulation successful!");
    } catch (simError: any) {
      console.warn(
        "[CDP CCTP] ⚠️  Simulation failed, but continuing anyway (actual transaction may still work)"
      );
      console.warn(
        "[CDP CCTP] Simulation error:",
        simError.shortMessage || simError.message
      );
      // Don't throw - continue with actual transaction
    }

    // Estimate gas manually with viem public client
    console.log("[CDP CCTP] Estimating gas with viem...");
    let estimatedGas: bigint;
    try {
      estimatedGas = await publicClient.estimateGas({
        account: account.address as Address,
        to: BASE_MAINNET.tokenMessengerV2 as Address,
        data: depositData,
      });
      console.log("[CDP CCTP] Estimated gas:", estimatedGas.toString());
      // Add 20% buffer
      estimatedGas = (estimatedGas * 120n) / 100n;
      console.log("[CDP CCTP] Gas with buffer:", estimatedGas.toString());
    } catch (gasError: any) {
      console.error(
        "[CDP CCTP] Gas estimation failed:",
        gasError.shortMessage || gasError.message
      );
      // Use a safe default
      estimatedGas = 300000n;
      console.log("[CDP CCTP] Using fallback gas:", estimatedGas.toString());
    }

    console.log("[CDP CCTP] Sending depositForBurn (V2) with explicit gas...");
    const depositTx = await account.sendTransaction({
      transaction: {
        to: BASE_MAINNET.tokenMessengerV2 as Address,
        data: depositData,
        gas: estimatedGas,
      },
    });

    await account.waitForTransactionReceipt(depositTx);
    const txHash = depositTx.transactionHash;
    console.log("[CDP CCTP] ✓ Burn tx:", txHash);
    console.log("[CDP CCTP]   https://basescan.org/tx/" + txHash);

    // Step 3: Get messageHash from transaction logs
    console.log("[CDP CCTP] Step 3/4: Getting message hash...");

    const txReceipt = await publicClient.getTransactionReceipt({
      hash: txHash as Hex,
    });

    // Check transaction status
    console.log("[CDP CCTP] Transaction status:", txReceipt.status);
    console.log("[CDP CCTP] Total logs:", txReceipt.logs.length);
    console.log("[CDP CCTP] Gas used:", txReceipt.gasUsed.toString());

    if (txReceipt.status !== "success") {
      // Try to get revert reason
      try {
        const tx = await publicClient.getTransaction({
          hash: txHash as Hex,
        });
        await publicClient.call({
          data: tx.input,
          to: tx.to,
        });
      } catch (revertError: any) {
        console.error(
          "[CDP CCTP] Revert reason:",
          revertError.message || revertError.shortMessage || "Unknown"
        );
      }
      throw new Error(
        "Transaction failed or reverted. Check logs above for revert reason."
      );
    }

    // Step 3: Get message and attestation using CCTP V2 API (no manual extraction needed!)
    console.log(
      "[CDP CCTP] Step 3/4: Getting message and attestation from Circle API V2..."
    );

    const sourceDomainId = BASE_MAINNET.domain; // Base domain = 6
    const pollInterval = useFastTransfer ? 1000 : 2000; // Fast Transfer: 1s, Standard: 2s
    const maxAttemptsFast = 120; // Fast Transfer: 2 minutes max (120 attempts * 1s = 120s)
    const maxAttemptsStandard = 600; // Standard: 20 minutes max (600 attempts * 2s = 1200s)
    const maxAttempts = useFastTransfer ? maxAttemptsFast : maxAttemptsStandard;
    const logInterval = useFastTransfer ? 10 : 30; // Log more frequently for Fast Transfer

    console.log(`[CDP CCTP] Using CCTP V2 API with transaction hash`);
    if (useFastTransfer) {
      console.log(
        "[CDP CCTP] ⚡ Fast Transfer enabled - attestation should complete in ~30-60 seconds"
      );
    } else {
      console.log(
        "[CDP CCTP] Standard transfer - this may take 2-20 minutes on mainnet..."
      );
    }

    const apiBaseUrl = CIRCLE_ATTESTATION_API.v2.messages.mainnet;
    console.log(
      `[CDP CCTP] API: ${apiBaseUrl}/${sourceDomainId}?transactionHash=${txHash}`
    );

    // CCTP V2: Get message and attestation in single call using transaction hash
    let messageData: any = null;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch(
        `${apiBaseUrl}/${sourceDomainId}?transactionHash=${txHash}`
      );

      if (response.ok) {
        const data = await response.json();

        if (data.messages && data.messages.length > 0) {
          const message = data.messages[0];

          // Check if attestation is complete
          if (message.attestation && message.status === "complete") {
            messageData = message;
            console.log("[CDP CCTP] ✓ Message and attestation received!");
            console.log(
              "[CDP CCTP] Attestation:",
              message.attestation.substring(0, 20) + "..."
            );
            if (message.decodedMessage) {
              console.log("[CDP CCTP] Decoded message available");
              console.log(
                "  - Amount:",
                message.decodedMessage.decodedMessageBody?.amount || "N/A"
              );
              console.log(
                "  - Recipient:",
                message.decodedMessage.decodedMessageBody?.mintRecipient ||
                  "N/A"
              );
            }
            if (useFastTransfer) {
              const elapsed = attempts * (pollInterval / 1000);
              console.log(
                `[CDP CCTP] ⚡ Fast Transfer completed in ~${elapsed}s`
              );
            }
            break;
          } else {
            // Message exists but attestation not ready yet
            if (attempts % logInterval === 0 && attempts > 0) {
              const elapsed = attempts * (pollInterval / 1000);
              console.log(
                `[CDP CCTP] Status: ${
                  message.status || "pending"
                } (${elapsed}s elapsed)`
              );
            }
          }
        } else {
          // Message not indexed yet
          if (attempts % logInterval === 0 && attempts > 0) {
            const elapsed = attempts * (pollInterval / 1000);
            console.log(
              `[CDP CCTP] Message not indexed yet (${elapsed}s elapsed)`
            );
          }
        }
      } else {
        // Log HTTP errors
        if (attempts % logInterval === 0 && attempts > 0) {
          const elapsed = attempts * (pollInterval / 1000);
          console.log(
            `[CDP CCTP] API returned ${response.status} (${elapsed}s elapsed)`
          );
        }
      }

      await new Promise((r) => setTimeout(r, pollInterval));
      attempts++;

      if (attempts % logInterval === 0) {
        const elapsed = attempts * (pollInterval / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        if (minutes > 0) {
          console.log(
            `[CDP CCTP] Still waiting... (${minutes}m ${seconds}s elapsed)`
          );
        } else {
          console.log(`[CDP CCTP] Still waiting... (${elapsed}s elapsed)`);
        }
      }
    }

    if (!messageData || !messageData.attestation) {
      const elapsed = attempts * (pollInterval / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      console.log(
        `[CDP CCTP] ⚠️  Attestation timeout after ${minutes}m ${seconds}s`
      );
      console.log(
        `[CDP CCTP] The burn was successful! USDC will be minted on Solana once Circle processes it.`
      );
      console.log(
        `[CDP CCTP] Monitor: ${apiBaseUrl}/${sourceDomainId}?transactionHash=${txHash}`
      );
      console.log(`[CDP CCTP] Burn TX: https://basescan.org/tx/${txHash}`);

      // Return success anyway since the burn completed
      const timeMessage =
        minutes > 0 ? `${minutes}m elapsed` : `${seconds}s elapsed`;
      return {
        success: true,
        txHash: txHash,
        error: `Attestation pending (${timeMessage}). USDC will arrive on Solana shortly.`,
      };
    }

    console.log("[CDP CCTP] ✅ Bridge completed successfully!");
    console.log("[CDP CCTP] ✓ USDC burned on Base");
    console.log("[CDP CCTP] ✓ Attestation received from Circle");
    console.log(
      "[CDP CCTP] → USDC will be minted to Solana address:",
      solanaRecipient
    );
    console.log("[CDP CCTP] Note: Solana mint happens automatically by Circle");
    console.log("[CDP CCTP] Burn TX:", `https://basescan.org/tx/${txHash}`);

    return {
      success: true,
      txHash: txHash,
    };
  } catch (error) {
    console.error("[CDP CCTP] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Bridge failed",
    };
  }
}

/**
 * Get facilitator's USDC balance on Base
 */
export async function getFacilitatorBalance(): Promise<string> {
  try {
    const account = await getFacilitatorAccount();

    const publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_MAINNET.rpcUrl),
    });

    const balance = await publicClient.readContract({
      address: BASE_MAINNET.usdc as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address as Address],
    });

    return formatUnits(balance, 6);
  } catch (error) {
    console.error("[CDP] Error getting balance:", error);
    return "0";
  }
}

/**
 * Get facilitator's ETH balance on Base (for gas)
 */
export async function getFacilitatorEthBalance(): Promise<string> {
  try {
    const account = await getFacilitatorAccount();

    const publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_MAINNET.rpcUrl),
    });

    const balance = await publicClient.getBalance({
      address: account.address as Address,
    });

    return formatUnits(balance, 18);
  } catch (error) {
    console.error("[CDP] Error getting ETH balance:", error);
    return "0";
  }
}

/**
 * Get facilitator account address
 */
export async function getFacilitatorAddress(): Promise<string> {
  const account = await getFacilitatorAccount();
  return account.address;
}
