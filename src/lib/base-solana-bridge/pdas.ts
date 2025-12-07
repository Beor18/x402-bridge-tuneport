import { PublicKey } from "@solana/web3.js";

export function hexTo32(bytesHex: string): Buffer {
  const h = bytesHex.startsWith("0x") ? bytesHex.slice(2) : bytesHex;
  if (h.length !== 64)
    throw new Error(
      `salt hex must be 32 bytes (64 hex chars). got ${h.length}`
    );
  return Buffer.from(h, "hex");
}

export function normalizeSalt(salt: Uint8Array | string | Buffer): Buffer {
  if (typeof salt === "string") return hexTo32(salt);
  if (Buffer.isBuffer(salt)) return salt;
  if (salt.length !== 32)
    throw new Error(`salt must be 32 bytes. got ${salt.length}`);
  return Buffer.from(salt);
}

export function deriveOutgoingMessagePda(
  salt: Uint8Array | string | Buffer,
  bridgeProgramId: PublicKey
): PublicKey {
  const s = normalizeSalt(salt);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("outgoing_message"), s],
    bridgeProgramId
  );
  return pda;
}

export function deriveMessageToRelayPda(
  salt: Uint8Array | string | Buffer,
  relayerProgramId: PublicKey
): PublicKey {
  const s = normalizeSalt(salt);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mtr"), s],
    relayerProgramId
  );
  return pda;
}

// Constantes del relayer program (del IDL oficial)
export const CFG_SEED = "config"; // Cambiado de "cfg" a "config" para coincidir con sol2base
export const MTR_SEED = "mtr";

/**
 * Obtener el PDA de cfg (config del relayer)
 */
export function getCfgAddress(relayerProgramId: PublicKey): PublicKey {
  const [cfgPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(CFG_SEED)],
    relayerProgramId
  );
  return cfgPda;
}
