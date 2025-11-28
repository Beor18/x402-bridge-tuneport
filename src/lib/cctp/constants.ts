/**
 * CCTP Contract Addresses and Configuration
 * Source: https://developers.circle.com/cctp/evm-smart-contracts
 */

// CCTP Domains
export const CCTP_DOMAINS = {
  ETHEREUM: 0,
  AVALANCHE: 1,
  OPTIMISM: 2,
  ARBITRUM: 3,
  SOLANA: 5,
  BASE: 6,
  POLYGON: 7,
} as const;

// Base Mainnet
// Source: https://developers.circle.com/stablecoins/evm-smart-contracts
export const BASE_MAINNET = {
  chainId: 8453,
  rpcUrl:
    "https://api.developer.coinbase.com/rpc/v1/base/aNh4GkSHTvoOtsTHdpCxLJnuzfmqX8dj",
  domain: CCTP_DOMAINS.BASE,
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  tokenMessenger: "0x1682Ae6375C4E4A97e4B583BC394c861A46D8962", // ✅ CORRECTED
  messageTransmitter: "0xAD09780d193884d503182aD4588450C416D6F9D4", // ✅ CORRECTED
} as const;

// Base Sepolia (Testnet)
export const BASE_SEPOLIA = {
  chainId: 84532,
  rpcUrl: "https://sepolia.base.org",
  domain: CCTP_DOMAINS.BASE,
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
  messageTransmitter: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
} as const;

// Solana Mainnet
export const SOLANA_MAINNET = {
  rpcUrl: "https://api.mainnet-beta.solana.com",
  domain: CCTP_DOMAINS.SOLANA,
  usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  messageTransmitterProgram: "CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd",
  tokenMessengerMinterProgram: "CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3",
} as const;

// Solana Devnet (Testnet)
export const SOLANA_DEVNET = {
  rpcUrl: "https://api.devnet.solana.com",
  domain: CCTP_DOMAINS.SOLANA,
  usdc: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  messageTransmitterProgram: "CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd",
  tokenMessengerMinterProgram: "CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3",
} as const;

// Circle Attestation API
export const CIRCLE_ATTESTATION_API = {
  mainnet: "https://iris-api.circle.com/v1/attestations",
  testnet: "https://iris-api-sandbox.circle.com/v1/attestations",
} as const;

// ABIs
export const TOKEN_MESSENGER_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint32", name: "destinationDomain", type: "uint32" },
      { internalType: "bytes32", name: "mintRecipient", type: "bytes32" },
      { internalType: "address", name: "burnToken", type: "address" },
    ],
    name: "depositForBurn",
    outputs: [{ internalType: "uint64", name: "_nonce", type: "uint64" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const MESSAGE_TRANSMITTER_ABI = [
  {
    inputs: [
      { internalType: "bytes", name: "message", type: "bytes" },
      { internalType: "bytes", name: "attestation", type: "bytes" },
    ],
    name: "receiveMessage",
    outputs: [{ internalType: "bool", name: "success", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const ERC20_ABI = [
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
