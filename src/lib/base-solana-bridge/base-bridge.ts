import {
  createPublicClient,
  createWalletClient,
  http,
  Address,
  padHex,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { BASE_MAINNET_CONFIG, BASE_SEPOLIA_CONFIG } from "./config";
import { pubkeyToBytes32 } from "./bridge-utils";
import { PublicKey } from "@solana/web3.js";

// ABI simplificado del Bridge contract
export const BRIDGE_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "localToken", type: "address" },
          { name: "remoteToken", type: "bytes32" },
          { name: "to", type: "bytes32" },
          { name: "remoteAmount", type: "uint256" },
        ],
        name: "transfer",
        type: "tuple",
      },
      { name: "calls", type: "tuple[]" },
    ],
    name: "bridgeToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "messageHash", type: "bytes32" }],
    name: "successes",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { name: "outgoingMessagePubkey", type: "bytes32" },
          { name: "gasLimit", type: "uint256" },
          { name: "nonce", type: "uint64" },
          { name: "sender", type: "bytes32" },
          { name: "ty", type: "uint8" },
          { name: "data", type: "bytes" },
        ],
        name: "messages",
        type: "tuple[]",
      },
    ],
    name: "relayMessages",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { name: "outgoingMessagePubkey", type: "bytes32" },
          { name: "gasLimit", type: "uint256" },
          { name: "nonce", type: "uint64" },
          { name: "sender", type: "bytes32" },
          { name: "ty", type: "uint8" },
          { name: "data", type: "bytes" },
        ],
        name: "message",
        type: "tuple",
      },
    ],
    name: "getMessageHash",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "BRIDGE_VALIDATOR",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ABI para transferir tokens ERC20
export const ERC20_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Crear cliente público para Base
export function getBaseClient(useMainnet: boolean = true) {
  const chain = useMainnet ? base : baseSepolia;
  const config = useMainnet ? BASE_MAINNET_CONFIG : BASE_SEPOLIA_CONFIG;
  return createPublicClient({
    chain,
    transport: http(config.rpcUrl),
  });
}

// Bridge token desde Base a Solana
// Basado en el código oficial del bridge
export async function bridgeTokenToSolana(params: {
  walletClient: any;
  to: string; // Dirección Solana destino (base58)
  amount: bigint; // Cantidad en lamports
  useMainnet?: boolean; // Por defecto true
}): Promise<string> {
  const { walletClient, to, amount, useMainnet = true } = params;

  const config = useMainnet ? BASE_MAINNET_CONFIG : BASE_SEPOLIA_CONFIG;

  // Importar funciones necesarias
  const { padHex } = await import("viem");

  // localToken: WSOL en Base
  const localToken = config.solToken as Address;

  // remoteToken: Native SOL en Solana (11111111111111111111111111111111) convertido a bytes32
  const solanaNativeAddress = new PublicKey("11111111111111111111111111111111");
  const remoteTokenBytes32 = padHex(
    pubkeyToBytes32(solanaNativeAddress) as `0x${string}`,
    {
      size: 32,
    }
  ) as `0x${string}`;

  // to: Dirección Solana destino convertida a bytes32
  const toPublicKey = new PublicKey(to);
  const toBytes32 = padHex(pubkeyToBytes32(toPublicKey) as `0x${string}`, {
    size: 32,
  }) as `0x${string}`;

  // Estimar gas primero
  const publicClient = getBaseClient(useMainnet);
  const { encodeFunctionData } = await import("viem");
  const estimatedGas = await publicClient.estimateGas({
    account: walletClient.account,
    to: config.bridge as Address,
    data: encodeFunctionData({
      abi: BRIDGE_ABI,
      functionName: "bridgeToken",
      args: [
        {
          localToken,
          remoteToken: remoteTokenBytes32,
          to: toBytes32,
          remoteAmount: amount,
        },
        [], // Sin llamadas adicionales (ixs)
      ],
    }),
  });

  // Agregar un 20% de margen al gas estimado
  const gasWithMargin = (estimatedGas * 120n) / 100n;

  const hash = await walletClient.writeContract({
    address: config.bridge as Address,
    abi: BRIDGE_ABI,
    functionName: "bridgeToken",
    args: [
      {
        localToken,
        remoteToken: remoteTokenBytes32,
        to: toBytes32,
        remoteAmount: amount,
      },
      [], // Sin llamadas adicionales (ixs)
    ],
    gas: gasWithMargin,
  });

  return hash;
}

// Transferir SOL (ERC20) en Base a un artista
export async function transferSolToArtist(params: {
  walletClient: any;
  artistAddress: Address;
  amount: bigint; // Cantidad en wei
  useMainnet?: boolean;
}): Promise<string> {
  const { walletClient, artistAddress, amount, useMainnet = true } = params;

  const config = useMainnet ? BASE_MAINNET_CONFIG : BASE_SEPOLIA_CONFIG;

  // Estimar gas primero
  const publicClient = getBaseClient(useMainnet);
  const { encodeFunctionData } = await import("viem");
  const estimatedGas = await publicClient.estimateGas({
    account: walletClient.account,
    to: config.solToken as Address,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [artistAddress, amount],
    }),
  });

  // Agregar un 20% de margen al gas estimado
  const gasWithMargin = (estimatedGas * 120n) / 100n;

  const hash = await walletClient.writeContract({
    address: config.solToken as Address,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [artistAddress, amount],
    gas: gasWithMargin,
  });

  return hash;
}

// Obtener balance de SOL en Base
export async function getSolBalanceInBase(
  address: Address,
  useMainnet: boolean = true
): Promise<bigint> {
  const config = useMainnet ? BASE_MAINNET_CONFIG : BASE_SEPOLIA_CONFIG;
  const client = getBaseClient(useMainnet);

  const balance = await client.readContract({
    address: config.solToken as Address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });

  return balance as bigint;
}
