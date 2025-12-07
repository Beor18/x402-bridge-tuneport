/**
 * Multi-chain USDC balance checker
 * Queries balances from Base and Solana without hardcoded values
 */

import { createPublicClient, http, formatUnits, type Address } from "viem";
import { base, baseSepolia } from "viem/chains";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";

// USDC contract addresses (these are official Circle addresses)
const USDC_ADDRESSES = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  baseSepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  solana: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  solanaDevnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
} as const;

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export interface WalletBalances {
  base: {
    address: string;
    usdcBalance: string;
    ethBalance: string;
    hasBalance: boolean;
  };
  solana: {
    address: string;
    usdcBalance: string;
    solBalance: string;
    hasBalance: boolean;
  };
  totalUsdc: string;
  preferredNetwork: "base" | "solana" | null;
}

/**
 * Get USDC balance on Base (EVM)
 */
// Base mainnet RPC
const BASE_RPC_URL = "https://mainnet.base.org";

export async function getBaseUsdcBalance(
  address: string,
  isMainnet: boolean = false
): Promise<string> {
  const chain = isMainnet ? base : baseSepolia;
  const usdcAddress = isMainnet
    ? USDC_ADDRESSES.base
    : USDC_ADDRESSES.baseSepolia;

  const client = createPublicClient({
    chain,
    transport: http(isMainnet ? BASE_RPC_URL : undefined),
  });

  try {
    const balance = await client.readContract({
      address: usdcAddress as Address,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [address as Address],
    });

    return formatUnits(balance, 6); // USDC has 6 decimals
  } catch (error) {
    console.error("Error fetching Base USDC balance:", error);
    return "0";
  }
}

/**
 * Get USDC balance on Solana
 */
export async function getSolanaUsdcBalance(
  address: string,
  isMainnet: boolean = false
): Promise<string> {
  // Use alternative RPC endpoints (public ones have rate limits)
  const rpcUrl = isMainnet
    ? "https://solana-mainnet.g.alchemy.com/v2/demo" // or use env var
    : "https://api.devnet.solana.com";
  const usdcMint = isMainnet
    ? USDC_ADDRESSES.solana
    : USDC_ADDRESSES.solanaDevnet;

  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const owner = new PublicKey(address);
    const mint = new PublicKey(usdcMint);
    const tokenAccount = await getAssociatedTokenAddress(mint, owner);

    const account = await getAccount(connection, tokenAccount);
    const balance = Number(account.amount) / 1e6; // USDC has 6 decimals

    return balance.toString();
  } catch {
    // Account might not exist or RPC error - return 0 silently
    return "0";
  }
}

/**
 * Get ETH balance on Base
 */
export async function getBaseEthBalance(
  address: string,
  isMainnet: boolean = true
): Promise<string> {
  const chain = isMainnet ? base : baseSepolia;
  const rpcUrl = isMainnet ? BASE_RPC_URL : undefined;

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  try {
    const balance = await client.getBalance({
      address: address as Address,
    });
    return formatUnits(balance, 18); // ETH has 18 decimals
  } catch (error) {
    console.error("Error fetching Base ETH balance:", error);
    return "0";
  }
}

/**
 * Get SOL balance on Solana
 */
export async function getSolanaSolBalance(
  address: string,
  isMainnet: boolean = true
): Promise<string> {
  const rpcUrl = isMainnet
    ? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      "https://mainnet.helius-rpc.com/?api-key=fc2a2d0a-fc68-4801-bd64-3e56031e4838"
    : "https://api.devnet.solana.com";

  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const publicKey = new PublicKey(address);
    const balance = await connection.getBalance(publicKey);
    return (balance / 1e9).toString(); // Convert lamports to SOL
  } catch (error) {
    console.error("Error fetching Solana SOL balance:", error);
    return "0";
  }
}

/**
 * Get combined balances from both networks
 */
export async function getMultiChainBalances(
  baseAddress: string | null,
  solanaAddress: string | null,
  isMainnet: boolean = true
): Promise<WalletBalances> {
  const [baseUsdc, baseEth, solanaUsdc, solanaSol] = await Promise.all([
    baseAddress
      ? getBaseUsdcBalance(baseAddress, isMainnet)
      : Promise.resolve("0"),
    baseAddress
      ? getBaseEthBalance(baseAddress, isMainnet)
      : Promise.resolve("0"),
    solanaAddress
      ? getSolanaUsdcBalance(solanaAddress, isMainnet)
      : Promise.resolve("0"),
    solanaAddress
      ? getSolanaSolBalance(solanaAddress, isMainnet)
      : Promise.resolve("0"),
  ]);

  const baseUsdcNum = parseFloat(baseUsdc);
  const solanaUsdcNum = parseFloat(solanaUsdc);
  const total = baseUsdcNum + solanaUsdcNum;

  // Determine preferred network (the one with more USDC balance)
  let preferredNetwork: "base" | "solana" | null = null;
  if (baseUsdcNum > 0 || solanaUsdcNum > 0) {
    preferredNetwork = baseUsdcNum >= solanaUsdcNum ? "base" : "solana";
  }

  return {
    base: {
      address: baseAddress || "",
      usdcBalance: baseUsdc,
      ethBalance: baseEth,
      hasBalance: baseUsdcNum > 0 || parseFloat(baseEth) > 0,
    },
    solana: {
      address: solanaAddress || "",
      usdcBalance: solanaUsdc,
      solBalance: solanaSol,
      hasBalance: solanaUsdcNum > 0 || parseFloat(solanaSol) > 0,
    },
    totalUsdc: total.toFixed(6),
    preferredNetwork,
  };
}

/**
 * Check if user can afford a payment
 */
export function canAfford(
  balances: WalletBalances,
  price: string
): {
  canPay: boolean;
  payWith: "base" | "solana" | "bridge" | null;
  needsBridge: boolean;
  bridgeFrom?: "base" | "solana";
  bridgeTo?: "base" | "solana";
} {
  const priceNum = parseFloat(price.replace("$", ""));
  const baseNum = parseFloat(balances.base.usdcBalance);
  const solanaNum = parseFloat(balances.solana.usdcBalance);

  // Can pay directly from Base
  if (baseNum >= priceNum) {
    return { canPay: true, payWith: "base", needsBridge: false };
  }

  // Can pay directly from Solana
  if (solanaNum >= priceNum) {
    return { canPay: true, payWith: "solana", needsBridge: false };
  }

  // Need to bridge? Check if combined balance is enough
  const totalNum = baseNum + solanaNum;
  if (totalNum >= priceNum) {
    // Determine bridge direction (move from smaller to larger balance)
    if (baseNum > solanaNum) {
      return {
        canPay: true,
        payWith: "bridge",
        needsBridge: true,
        bridgeFrom: "solana",
        bridgeTo: "base",
      };
    } else {
      return {
        canPay: true,
        payWith: "bridge",
        needsBridge: true,
        bridgeFrom: "base",
        bridgeTo: "solana",
      };
    }
  }

  return { canPay: false, payWith: null, needsBridge: false };
}
