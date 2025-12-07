/**
 * Implementación del bridge Solana → Base siguiendo la documentación oficial
 * Basado en: https://github.com/base/bridge
 * Adaptado para mainnet (facilitator-bridge-tune usa mainnet)
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  SOLANA_MAINNET_CONFIG,
  BASE_MAINNET_CONFIG,
  SOLANA_DEVNET_CONFIG,
  BASE_SEPOLIA_CONFIG,
} from "./config";
import {
  deriveOutgoingMessagePda,
  deriveMessageToRelayPda,
  getCfgAddress,
} from "./pdas";

/**
 * Obtener el vault de SOL en Solana
 * El vault es un PDA derivado del bridge program
 */
export function getSolVaultAddress(bridgeProgramId: PublicKey): PublicKey {
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault")],
    bridgeProgramId
  );
  return vault;
}

/**
 * Obtener el bridge account address (PDA)
 */
export function getBridgeAccountAddress(bridgeProgramId: PublicKey): PublicKey {
  const [bridgeAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("bridge")],
    bridgeProgramId
  );
  return bridgeAccount;
}

/**
 * Discriminador de Anchor para bridge_sol (del código generado oficial)
 * BRIDGE_SOL_DISCRIMINATOR = [190, 190, 32, 158, 75, 153, 32, 86]
 */
const BRIDGE_SOL_DISCRIMINATOR = Buffer.from([
  190, 190, 32, 158, 75, 153, 32, 86,
]);

/**
 * Discriminador oficial de PayForRelay (del código generado oficial)
 */
const PAY_FOR_RELAY_DISCRIMINATOR = Buffer.from([
  41, 191, 218, 201, 250, 164, 156, 55,
]);

/**
 * Crear instrucción para pagar el relay (PayForRelay) con salt específico
 * Basado en el código oficial de sol2base
 */
function createPayForRelayInstructionWithSalt(params: {
  relayerProgramId: PublicKey;
  outgoingMessage: PublicKey;
  messageToRelay: PublicKey;
  messageToRelaySalt: Buffer;
  payer: PublicKey;
  gasFeeReceiver: PublicKey;
}): TransactionInstruction {
  const {
    relayerProgramId,
    outgoingMessage,
    messageToRelay,
    messageToRelaySalt,
    payer,
    gasFeeReceiver,
  } = params;

  // Obtener PDA de cfg
  const cfgAddress = getCfgAddress(relayerProgramId);

  // Gas limit por defecto (200,000) - como en sol2base DEFAULT_GAS_LIMIT
  // Esto es el gas que se pagará en Base, no en Solana
  const gasLimit = BigInt(process.env.NEXT_PUBLIC_GAS_LIMIT ?? "200000");

  // Construir datos de la instrucción (como en sol2base)
  const data = Buffer.alloc(8 + 32 + 32 + 8);
  let offset = 0;

  // 1. Discriminador (8 bytes)
  PAY_FOR_RELAY_DISCRIMINATOR.copy(data, offset);
  offset += 8;

  // 2. mtrSalt (32 bytes)
  messageToRelaySalt.copy(data, offset);
  offset += 32;

  // 3. outgoingMessage (32 bytes - PublicKey)
  outgoingMessage.toBuffer().copy(data, offset);
  offset += 32;

  // 4. gasLimit (8 bytes - u64 little endian)
  data.writeBigUInt64LE(gasLimit, offset);

  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: cfgAddress, isSigner: false, isWritable: true },
      { pubkey: gasFeeReceiver, isSigner: false, isWritable: true },
      { pubkey: messageToRelay, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: relayerProgramId,
    data,
  });
}

/**
 * Crear instrucción para bridge de SOL desde Solana a Base
 */
export function createBridgeSolInstruction(params: {
  payer: PublicKey;
  from: PublicKey;
  gasFeeReceiver: PublicKey;
  solVault: PublicKey;
  bridge: PublicKey;
  outgoingMessage: PublicKey;
  outgoingMessageSalt: Uint8Array;
  to: string;
  amount: bigint;
  bridgeProgramId: PublicKey;
}): TransactionInstruction {
  const {
    payer,
    from,
    gasFeeReceiver,
    solVault,
    bridge,
    outgoingMessage,
    outgoingMessageSalt,
    to,
    amount,
    bridgeProgramId,
  } = params;

  // Convertir dirección Base a 20 bytes (dirección Ethereum/Base)
  // En sol2base usan addressToBytes20 que normaliza a lowercase y valida
  const toLower = to.toLowerCase();

  // Validar y convertir como en sol2base
  const cleanAddress = toLower.startsWith("0x") ? toLower.slice(2) : toLower;

  // Validar que sea exactamente 40 hex characters (20 bytes)
  if (cleanAddress.length !== 40) {
    throw new Error(
      `Invalid Ethereum address length: expected 40 hex chars, got ${cleanAddress.length}`
    );
  }

  // Validar hex characters
  if (!/^[0-9a-f]{40}$/.test(cleanAddress)) {
    throw new Error(
      `Invalid Ethereum address format: contains non-hex characters`
    );
  }

  const toBytes20 = Buffer.from(cleanAddress, "hex");

  // Crear la instrucción del bridge program según la estructura oficial
  // Estructura: discriminator (8) + outgoingMessageSalt (32) + to (20) + amount (8) + call (Option)
  const instructionData = Buffer.alloc(200);
  let offset = 0;

  // 1. Discriminador (8 bytes)
  BRIDGE_SOL_DISCRIMINATOR.copy(instructionData, offset);
  offset += 8;

  // 2. outgoingMessageSalt (32 bytes)
  const saltBuffer = Buffer.from(outgoingMessageSalt);
  if (saltBuffer.length !== 32) {
    throw new Error(`Salt debe ser 32 bytes, recibido: ${saltBuffer.length}`);
  }
  saltBuffer.copy(instructionData, offset);
  offset += 32;

  // 3. to (20 bytes) - dirección Base destino
  toBytes20.copy(instructionData, offset);
  offset += 20;

  // 4. amount (8 bytes) - u64 little endian
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(amount, 0);
  amountBuffer.copy(instructionData, offset);
  offset += 8;

  // 5. call (Option<Call>) - null por ahora (1 byte para Some/None + datos)
  // Option se serializa como: 0x00 para None, 0x01 para Some + datos
  instructionData.writeUInt8(0, offset); // None (no hay call)
  offset += 1;

  // Reducir el buffer al tamaño real
  const finalData = instructionData.slice(0, offset);

  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: from, isSigner: false, isWritable: true }, // from NO es signer (como en sol2base)
      { pubkey: gasFeeReceiver, isSigner: false, isWritable: true },
      { pubkey: solVault, isSigner: false, isWritable: true },
      { pubkey: bridge, isSigner: false, isWritable: true },
      { pubkey: outgoingMessage, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: bridgeProgramId,
    data: finalData,
  });
}

/**
 * Función completa para bridge SOL desde Solana a Base con auto-relay
 * Siguiendo el ejemplo de la documentación
 * Esta versión usa PublicKey en lugar de Keypair para trabajar con wallets conectadas
 */
export async function bridgeSolToBase(params: {
  connection: Connection;
  payer: PublicKey;
  to: string;
  amount: number;
  useMainnet?: boolean; // Por defecto true (facilitator-bridge-tune usa mainnet)
}): Promise<{ transaction: Transaction; outgoingMessage: PublicKey }> {
  const { connection, payer, to, amount, useMainnet = true } = params;

  // Usar mainnet o devnet según el parámetro
  const solanaConfig = useMainnet
    ? SOLANA_MAINNET_CONFIG
    : SOLANA_DEVNET_CONFIG;

  const bridgeProgramId = new PublicKey(solanaConfig.bridgeProgram);
  const relayerProgramId = new PublicKey(solanaConfig.baseRelayerProgram);

  // Obtener direcciones necesarias
  const solVault = getSolVaultAddress(bridgeProgramId);
  const bridgeAccount = getBridgeAccountAddress(bridgeProgramId);

  // Obtener gasFeeReceiver del bridge account o usar el configurado
  const gasFeeReceiver = new PublicKey(solanaConfig.gasFeeReceiver);

  // Generar salt bundle (como en sol2base: mismo salt para ambos PDAs)
  const salt32 = new Uint8Array(32);
  crypto.getRandomValues(salt32);
  const saltBuffer = Buffer.from(salt32);

  // Derivar ambos PDAs con el mismo salt (como en sol2base)
  const outgoingMessage = deriveOutgoingMessagePda(saltBuffer, bridgeProgramId);
  const messageToRelay = deriveMessageToRelayPda(saltBuffer, relayerProgramId);

  console.info("[bridge] salt32:", `0x${saltBuffer.toString("hex")}`);
  console.info("[bridge] outgoingMessagePDA:", outgoingMessage.toBase58());
  console.info("[bridge] messageToRelayPDA:", messageToRelay.toBase58());
  console.info("[bridge] network:", useMainnet ? "mainnet" : "devnet");

  // Convertir cantidad a lamports
  const amountLamports = BigInt(Math.floor(amount * 1e9));

  // Crear transacción (como en sol2base)
  const transaction = new Transaction();
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = payer;

  // Verificar si el cfg está inicializado (como en sol2base)
  const cfgAddress = getCfgAddress(relayerProgramId);
  let cfgAccount;

  try {
    cfgAccount = await connection.getAccountInfo(cfgAddress, "confirmed");
  } catch (error) {
    console.error("❌ Error fetching cfg account:", error);
    // Si falla el RPC, intentar con un timeout más corto o retry
    try {
      cfgAccount = (await Promise.race([
        connection.getAccountInfo(cfgAddress, "confirmed"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("RPC timeout")), 10000)
        ),
      ])) as typeof cfgAccount;
    } catch (retryError) {
      console.error("❌ Retry failed:", retryError);
      throw new Error(
        `Failed to connect to Solana RPC. Please check your connection or try again later. Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  if (!cfgAccount) {
    console.log(
      "❌ Relayer config account does not exist:",
      cfgAddress.toString()
    );
    throw new Error(
      "Base relayer config account not found. Bridge may not be fully initialized."
    );
  }

  // Crear la instrucción payForRelay
  const payForRelayIx = createPayForRelayInstructionWithSalt({
    relayerProgramId,
    outgoingMessage,
    messageToRelay,
    messageToRelaySalt: saltBuffer,
    payer,
    gasFeeReceiver,
  });

  // Crear la instrucción bridge
  const bridgeIx = createBridgeSolInstruction({
    payer,
    from: payer,
    gasFeeReceiver,
    solVault,
    bridge: bridgeAccount,
    outgoingMessage,
    outgoingMessageSalt: saltBuffer,
    to,
    amount: amountLamports,
    bridgeProgramId,
  });

  // Agregar ambas instrucciones (como en sol2base)
  transaction.add(payForRelayIx);
  transaction.add(bridgeIx);

  return { transaction, outgoingMessage };
}

/**
 * Obtener el outgoing message PDA con salt aleatorio
 * Retorna tanto el salt como el pubkey (como en la implementación oficial)
 */
export function getOutgoingMessageAddress(
  bridgeProgramId: PublicKey,
  salt?: Uint8Array
): { salt: Uint8Array; pubkey: PublicKey } {
  // Generar salt aleatorio de 32 bytes si no se proporciona
  const messageSalt = salt || crypto.getRandomValues(new Uint8Array(32));

  const [messagePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("outgoing_message"), Buffer.from(messageSalt)],
    bridgeProgramId
  );
  return { salt: messageSalt, pubkey: messagePda };
}
