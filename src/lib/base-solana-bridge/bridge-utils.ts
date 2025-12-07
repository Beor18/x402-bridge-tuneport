import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Convertir dirección Solana (PublicKey) a bytes32 para contratos Base
 * Basado en la documentación oficial de Base Bridge
 */
export function pubkeyToBytes32(pubkey: PublicKey): string {
  const bytes = pubkey.toBytes();
  // Convertir a hex y pad a 64 caracteres (32 bytes)
  const hex = Buffer.from(bytes).toString("hex");
  return "0x" + hex.padStart(64, "0");
}

/**
 * Convertir dirección Base (0x...) a bytes para Solana
 */
export function addressToBytes(address: string): Uint8Array {
  const hex = address.startsWith("0x") ? address.slice(2) : address;
  return Buffer.from(hex, "hex");
}

/**
 * Convertir dirección Base a PublicKey de Solana
 */
export function addressToPubkey(address: string): PublicKey {
  const bytes = addressToBytes(address);
  // Si es menor a 32 bytes, pad con ceros
  const padded = new Uint8Array(32);
  padded.set(bytes.slice(0, 32), 0);
  return new PublicKey(padded);
}

/**
 * Convertir bytes a string hex con prefijo 0x
 */
export function toBytes(data: string | Uint8Array | PublicKey): string {
  if (data instanceof PublicKey) {
    return "0x" + Buffer.from(data.toBytes()).toString("hex");
  }
  if (typeof data === "string") {
    if (data.startsWith("0x")) {
      return data;
    }
    // Asumir que es base58 de Solana
    try {
      const decoded = bs58.decode(data);
      return "0x" + Buffer.from(decoded).toString("hex");
    } catch {
      // Si no es base58, asumir que ya es hex
      return data.startsWith("0x") ? data : "0x" + data;
    }
  }
  return "0x" + Buffer.from(data).toString("hex");
}

/**
 * Obtener el Twin contract address en Base para una wallet de Solana
 * El Twin se deriva determinísticamente de la dirección de Solana
 */
export function getTwinAddress(solanaAddress: PublicKey): string {
  // El Twin se calcula usando keccak256 hash de la dirección de Solana
  // Esta es una implementación simplificada - en producción usarías el cálculo real del contrato
  const bytes = solanaAddress.toBytes();
  // Hash simplificado (en producción usarías keccak256)
  const hash = Buffer.from(bytes).toString("hex");
  return "0x" + hash.slice(0, 40).padStart(40, "0");
}
