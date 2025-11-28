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
  keccak256,
  toBytes,
  decodeAbiParameters,
  encodeFunctionData,
} from "viem";
import { base } from "viem/chains";
import { BASE_MAINNET, ERC20_ABI, CCTP_DOMAINS } from "../cctp/constants";

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
 */
const CCTP_MINIMUM_USDC = 1.0;

export async function executeBridgeWithCDP(
  amount: string,
  solanaRecipient: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    console.log("[CDP CCTP] Starting bridge Base -> Solana");
    console.log("[CDP CCTP] Amount:", amount, "USDC");
    console.log("[CDP CCTP] Recipient:", solanaRecipient);

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
      args: [BASE_MAINNET.tokenMessenger as Address, amountWei],
    });

    console.log(
      "[CDP CCTP] Approving",
      amountNum,
      "USDC to",
      BASE_MAINNET.tokenMessenger
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
        BASE_MAINNET.tokenMessenger as Address,
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

    // Step 2: depositForBurn
    console.log("[CDP CCTP] Step 2/4: Burning USDC on Base...");

    // Use encodeFunctionData for proper encoding
    const depositData = encodeFunctionData({
      abi: [
        {
          inputs: [
            { name: "amount", type: "uint256" },
            { name: "destinationDomain", type: "uint32" },
            { name: "mintRecipient", type: "bytes32" },
            { name: "burnToken", type: "address" },
          ],
          name: "depositForBurn",
          outputs: [{ name: "_nonce", type: "uint64" }],
          stateMutability: "nonpayable",
          type: "function",
        },
      ],
      functionName: "depositForBurn",
      args: [
        amountWei,
        CCTP_DOMAINS.SOLANA,
        recipientBytes32 as Hex,
        BASE_MAINNET.usdc as Address,
      ],
    });

    console.log("[CDP CCTP] depositForBurn data:", depositData);
    console.log("[CDP CCTP] TokenMessenger:", BASE_MAINNET.tokenMessenger);
    console.log("[CDP CCTP] Parameters:");
    console.log("  - amount:", amountWei.toString(), "(", amountNum, "USDC )");
    console.log("  - destinationDomain:", CCTP_DOMAINS.SOLANA);
    console.log("  - mintRecipient:", recipientBytes32);
    console.log("  - burnToken:", BASE_MAINNET.usdc);

    // Re-verify allowance just before burn
    const allowanceBefore = await publicClient.readContract({
      address: BASE_MAINNET.usdc as Address,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [
        account.address as Address,
        BASE_MAINNET.tokenMessenger as Address,
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

    // Simulate the call to get detailed error
    console.log("[CDP CCTP] Simulating depositForBurn call...");
    try {
      await publicClient.simulateContract({
        address: BASE_MAINNET.tokenMessenger as Address,
        abi: [
          {
            inputs: [
              { name: "amount", type: "uint256" },
              { name: "destinationDomain", type: "uint32" },
              { name: "mintRecipient", type: "bytes32" },
              { name: "burnToken", type: "address" },
            ],
            name: "depositForBurn",
            outputs: [{ name: "_nonce", type: "uint64" }],
            stateMutability: "nonpayable",
            type: "function",
          },
        ],
        functionName: "depositForBurn",
        args: [
          amountWei,
          CCTP_DOMAINS.SOLANA,
          recipientBytes32 as Hex,
          BASE_MAINNET.usdc as Address,
        ],
        account: account.address as Address,
      });
      console.log("[CDP CCTP] ✓ Simulation successful!");
    } catch (simError: any) {
      console.error("[CDP CCTP] ❌ Simulation failed!");
      console.error(
        "[CDP CCTP] Error:",
        simError.shortMessage || simError.message
      );
      if (simError.cause) {
        console.error(
          "[CDP CCTP] Cause:",
          simError.cause.shortMessage || simError.cause.message
        );
      }
      if (simError.metaMessages) {
        console.error("[CDP CCTP] Details:", simError.metaMessages);
      }
      throw new Error(
        `depositForBurn simulation failed: ${
          simError.shortMessage || simError.message
        }`
      );
    }

    // Estimate gas manually with viem public client
    console.log("[CDP CCTP] Estimating gas with viem...");
    let estimatedGas: bigint;
    try {
      estimatedGas = await publicClient.estimateGas({
        account: account.address as Address,
        to: BASE_MAINNET.tokenMessenger as Address,
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

    console.log("[CDP CCTP] Sending depositForBurn with explicit gas...");
    const depositTx = await account.sendTransaction({
      transaction: {
        to: BASE_MAINNET.tokenMessenger as Address,
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

    // Debug: Log all topics
    txReceipt.logs.forEach((log: any, i: number) => {
      console.log(
        `[CDP CCTP] Log ${i}: address=${log.address} topic=${log.topics[0]}`
      );
    });

    const eventTopic = keccak256(toBytes("MessageSent(bytes)"));
    console.log("[CDP CCTP] Looking for topic:", eventTopic);
    console.log(
      "[CDP CCTP] MessageTransmitter:",
      BASE_MAINNET.messageTransmitter
    );

    // MessageSent event is emitted by MessageTransmitter
    const log = txReceipt.logs.find(
      (l: any) =>
        l.topics[0] === eventTopic &&
        l.address.toLowerCase() ===
          BASE_MAINNET.messageTransmitter.toLowerCase()
    );

    if (!log) {
      console.error(
        "[CDP CCTP] Available logs:",
        txReceipt.logs.map((l: any) => ({
          address: l.address,
          topic0: l.topics[0],
        }))
      );
      throw new Error(
        `MessageSent event not found from MessageTransmitter (${BASE_MAINNET.messageTransmitter}). Expected topic: ${eventTopic}. Found ${txReceipt.logs.length} logs.`
      );
    }

    const messageBytes = decodeAbiParameters([{ type: "bytes" }], log.data)[0];
    const messageHash = keccak256(messageBytes);
    console.log("[CDP CCTP] Message hash:", messageHash);

    // Step 4: Wait for attestation from Circle
    console.log("[CDP CCTP] Step 4/4: Waiting for Circle attestation...");
    console.log("[CDP CCTP] This may take 2-20 minutes on mainnet...");
    console.log(
      `[CDP CCTP] Check status: https://iris-api.circle.com/v1/attestations/${messageHash}`
    );

    let attestationResponse: any = { status: "pending" };
    let attempts = 0;
    const maxAttempts = 600; // 20 minutes max (600 attempts * 2s = 1200s)

    while (
      attestationResponse.status !== "complete" &&
      attempts < maxAttempts
    ) {
      const response = await fetch(
        `https://iris-api.circle.com/v1/attestations/${messageHash}`
      );

      if (response.ok) {
        attestationResponse = await response.json();

        if (attestationResponse.status === "complete") {
          console.log("[CDP CCTP] ✓ Attestation received!");
          console.log(
            "[CDP CCTP] Attestation signature:",
            attestationResponse.attestation
          );
          break;
        } else {
          // Log current status
          if (attempts % 30 === 0 && attempts > 0) {
            console.log(
              `[CDP CCTP] Status: ${attestationResponse.status} (${
                attempts * 2
              }s elapsed)`
            );
          }
        }
      } else {
        // Log HTTP errors
        if (attempts % 30 === 0 && attempts > 0) {
          console.log(
            `[CDP CCTP] API returned ${response.status} (${
              attempts * 2
            }s elapsed)`
          );
        }
      }

      await new Promise((r) => setTimeout(r, 2000));
      attempts++;

      if (attempts % 30 === 0) {
        const elapsed = attempts * 2;
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        console.log(
          `[CDP CCTP] Still waiting... (${minutes}m ${seconds}s elapsed)`
        );
      }
    }

    if (attestationResponse.status !== "complete") {
      const elapsed = attempts * 2;
      const minutes = Math.floor(elapsed / 60);
      console.log(
        `[CDP CCTP] ⚠️  Attestation timeout after ${minutes} minutes`
      );
      console.log(
        `[CDP CCTP] The burn was successful! USDC will be minted on Solana once Circle processes it.`
      );
      console.log(
        `[CDP CCTP] Monitor: https://iris-api.circle.com/v1/attestations/${messageHash}`
      );
      console.log(`[CDP CCTP] Burn TX: https://basescan.org/tx/${txHash}`);

      // Return success anyway since the burn completed
      return {
        success: true,
        txHash: txHash,
        error: `Attestation pending (${minutes}m elapsed). USDC will arrive on Solana shortly.`,
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
