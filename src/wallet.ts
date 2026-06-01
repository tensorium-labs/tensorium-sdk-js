import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bech32 } from 'bech32';
import { bytesToHex, hexToBytes } from './encoding.js';

const ADDRESS_HRP = 'txm';

function pubkeyToAddress(compressedPubkey: Uint8Array): string {
  const hash = sha256(compressedPubkey);
  const payload = hash.slice(0, 20);
  const words = bech32.toWords(payload);
  return bech32.encode(ADDRESS_HRP, words);
}

export class TxmWallet {
  readonly privateKeyHex: string;
  readonly publicKeyHex: string;
  readonly address: string;

  private constructor(privateKeyBytes: Uint8Array) {
    const pubkey = secp.getPublicKey(privateKeyBytes, true); // compressed
    this.privateKeyHex = bytesToHex(privateKeyBytes);
    this.publicKeyHex = bytesToHex(pubkey);
    this.address = pubkeyToAddress(pubkey);
  }

  static generate(): TxmWallet {
    return new TxmWallet(secp.utils.randomPrivateKey());
  }

  static fromPrivateKey(hex: string): TxmWallet {
    const bytes = hexToBytes(hex);
    return new TxmWallet(bytes);
  }
}
