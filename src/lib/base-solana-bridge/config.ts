// Configuración del bridge Base-Solana
// Adaptado para mainnet (facilitator-bridge-tune usa mainnet)

export const BASE_MAINNET_CONFIG = {
  rpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org",
  bridge:
    process.env.NEXT_PUBLIC_BASE_BRIDGE ||
    "0x3eff766C76a1be2Ce1aCF2B69c78bCae257D5188", // Base Mainnet Bridge
  bridgeValidator:
    process.env.NEXT_PUBLIC_BASE_BRIDGE_VALIDATOR ||
    "0xAF24c1c24Ff3BF1e6D882518120fC25442d6794B", // Base Mainnet Bridge Validator
  solToken:
    process.env.NEXT_PUBLIC_BASE_SOL_TOKEN ||
    "0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82", // Wrapped SOL on Base Mainnet
  chainId: 8453, // Base Mainnet
} as const;

export const SOLANA_MAINNET_CONFIG = {
  rpcUrl:
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    "https://mainnet.helius-rpc.com/?api-key=fc2a2d0a-fc68-4801-bd64-3e56031e4838",
  bridgeProgram:
    process.env.NEXT_PUBLIC_SOLANA_BRIDGE_PROGRAM ||
    "HNCne2FkVaNghhjKXapxJzPaBvAKDG1Ge3gqhZyfVWLM", // Solana Mainnet Bridge Program
  baseRelayerProgram:
    process.env.NEXT_PUBLIC_SOLANA_BASE_RELAYER_PROGRAM ||
    "g1et5VenhfJHJwsdJsDbxWZuotD5H4iELNG61kS4fb9", // Solana Mainnet Base Relayer Program
  gasFeeReceiver:
    process.env.NEXT_PUBLIC_SOLANA_MAINNET_GAS_FEE_RECEIVER ||
    "4m2jaKbJ4pDZw177BmLPMLsztPF5eVFo2fvxPgajdBNz", // Gas fee receiver para Mainnet (diferente de devnet)
} as const;

// También mantener config para devnet si se necesita en el futuro
export const BASE_SEPOLIA_CONFIG = {
  rpcUrl:
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
  bridge:
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_BRIDGE ||
    "0x01824a90d32A69022DdAEcC6C5C14Ed08dB4EB9B",
  bridgeValidator:
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_BRIDGE_VALIDATOR ||
    "0xa80C07DF38fB1A5b3E6a4f4FAAB71E7a056a4EC7",
  solToken:
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_SOL_TOKEN ||
    "0xCace0c896714DaF7098FFD8CC54aFCFe0338b4BC",
  chainId: 84532,
} as const;

export const SOLANA_DEVNET_CONFIG = {
  rpcUrl:
    process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL ||
    "https://api.devnet.solana.com",
  // RPCs alternativos para fallback
  rpcUrls: [
    process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL ||
      "https://api.devnet.solana.com",
    "https://solana-devnet.g.alchemy.com/v2/demo",
    "https://rpc.ankr.com/solana_devnet",
  ],
  bridgeProgram:
    process.env.NEXT_PUBLIC_SOLANA_DEVNET_BRIDGE_PROGRAM ||
    "7c6mteAcTXaQ1MFBCrnuzoZVTTAEfZwa6wgy4bqX3KXC",
  baseRelayerProgram:
    process.env.NEXT_PUBLIC_SOLANA_DEVNET_BASE_RELAYER_PROGRAM ||
    "56MBBEYAtQAdjT4e1NzHD8XaoyRSTvfgbSVVcEcHj51H",
  gasFeeReceiver:
    process.env.NEXT_PUBLIC_SOLANA_DEVNET_GAS_FEE_RECEIVER ||
    "AFs1LCbodhvwpgX3u3URLsud6R1XMSaMiQ5LtXw4GKYT",
} as const;
