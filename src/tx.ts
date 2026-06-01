import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import type { Utxo, TxOutput, RawTx } from './types.js';

// @noble/secp256k1 v2 requires hmacSha256Sync for synchronous sign()
secp.etc.hmacSha256Sync = (k, ...m) => hmac(sha256, k, secp.etc.concatBytes(...m));
import { InsufficientBalance } from './types.js';
import type { TxmWallet } from './wallet.js';
import type { TxmRPC } from './rpc.js';

type UnsignedInput = {
  previous_output: { txid: Uint8Array; output_index: number };
  signature_script: Uint8Array;
};

function doubleSha256(bytes: Uint8Array): Uint8Array {
  return sha256(sha256(bytes));
}

function le32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function le64(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

// Encode compact secp256k1 signature (64B = r||s) to DER — matches Rust k256 output
function sigToDER(compact: Uint8Array): Uint8Array {
  const r = compact.slice(0, 32);
  const s = compact.slice(32, 64);
  function encodeInt(n: Uint8Array): Uint8Array {
    // Strip leading zeros, prepend 0x00 if high bit set
    let i = 0;
    while (i < n.length - 1 && n[i] === 0) i++;
    const trimmed = n.slice(i);
    const needsPad = trimmed[0] >= 0x80;
    const out = new Uint8Array(needsPad ? trimmed.length + 1 : trimmed.length);
    if (needsPad) out[0] = 0;
    out.set(trimmed, needsPad ? 1 : 0);
    return out;
  }
  const rEnc = encodeInt(r);
  const sEnc = encodeInt(s);
  const totalLen = 2 + rEnc.length + 2 + sEnc.length;
  const der = new Uint8Array(2 + totalLen);
  der[0] = 0x30; der[1] = totalLen;
  der[2] = 0x02; der[3] = rEnc.length; der.set(rEnc, 4);
  const sOffset = 4 + rEnc.length;
  der[sOffset] = 0x02; der[sOffset + 1] = sEnc.length; der.set(sEnc, sOffset + 2);
  return der;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

export function txId(
  inputs: UnsignedInput[],
  outputs: TxOutput[],
  payload: Uint8Array = new Uint8Array(0)
): string {
  const parts: Uint8Array[] = [];
  for (const inp of inputs) {
    parts.push(inp.previous_output.txid);
    parts.push(le32(inp.previous_output.output_index));
    parts.push(inp.signature_script);
  }
  for (const out of outputs) {
    parts.push(le64(out.value_atoms));
    parts.push(new TextEncoder().encode(out.address));
  }
  parts.push(payload);
  return Buffer.from(doubleSha256(concat(parts))).toString('hex');
}

export function selectUtxos(utxos: Utxo[], targetAtoms: bigint): Utxo[] {
  const mature = utxos.filter(u => u.mature);
  const sorted = [...mature].sort((a, b) => Number(b.value_atoms - a.value_atoms));
  const selected: Utxo[] = [];
  let total = 0n;
  for (const u of sorted) {
    selected.push(u);
    total += u.value_atoms;
    if (total >= targetAtoms) return selected;
  }
  const have = mature.reduce((s, u) => s + u.value_atoms, 0n);
  throw new InsufficientBalance(have, targetAtoms);
}

export function buildAndSign(
  wallet: TxmWallet,
  utxos: Utxo[],
  outputs: TxOutput[],
  payload: Uint8Array = new Uint8Array(0)
): RawTx {
  const unsignedInputs: UnsignedInput[] = utxos.map(u => ({
    previous_output: {
      txid: Uint8Array.from(Buffer.from(u.txid, 'hex')),
      output_index: u.output_index,
    },
    signature_script: new Uint8Array(0),
  }));

  const totalIn = utxos.reduce((s, u) => s + u.value_atoms, 0n);
  const totalOut = outputs.reduce((s, o) => s + o.value_atoms, 0n);
  const allOutputs = [...outputs];
  if (totalIn > totalOut) {
    allOutputs.push({ address: wallet.address, value_atoms: totalIn - totalOut });
  }

  const sigHashHex = txId(unsignedInputs, allOutputs, payload);
  const sigHashBytes = Uint8Array.from(Buffer.from(sigHashHex, 'hex'));

  const privBytes = Uint8Array.from(Buffer.from(wallet.privateKeyHex, 'hex'));
  const sig = secp.sign(sigHashBytes, privBytes);
  const derHex = Buffer.from(sigToDER(sig.toCompactRawBytes())).toString('hex');

  const sigScriptBytes = Array.from(
    new TextEncoder().encode(JSON.stringify({ public_key_hex: wallet.publicKeyHex, signature_hex: derHex }))
  );

  const signedInputs = unsignedInputs.map(inp => ({
    previous_output: {
      txid: Array.from(inp.previous_output.txid),
      output_index: inp.previous_output.output_index,
    },
    signature_script: sigScriptBytes,
  }));

  const signedForId: UnsignedInput[] = signedInputs.map(inp => ({
    previous_output: {
      txid: Uint8Array.from(inp.previous_output.txid),
      output_index: inp.previous_output.output_index,
    },
    signature_script: Uint8Array.from(inp.signature_script),
  }));
  const finalTxId = txId(signedForId, allOutputs, payload);

  return {
    id: Array.from(Uint8Array.from(Buffer.from(finalTxId, 'hex'))),
    inputs: signedInputs,
    outputs: allOutputs.map(o => ({ value_atoms: Number(o.value_atoms), address: o.address })),
    payload: Array.from(payload),
  };
}

export async function send(
  rpc: TxmRPC,
  wallet: TxmWallet,
  to: string,
  atoms: bigint,
  payload?: Uint8Array
): Promise<string> {
  const { utxos } = await rpc.getUtxos(wallet.address);
  const parsed: Utxo[] = utxos.map((u: any) => ({ ...u, value_atoms: BigInt(u.value_atoms) }));
  const selected = selectUtxos(parsed, atoms);
  const tx = buildAndSign(wallet, selected, [{ address: to, value_atoms: atoms }], payload);
  const result = await rpc.sendRawTransaction(tx);
  return result.txid;
}
