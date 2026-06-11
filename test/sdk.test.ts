import { describe, it, expect, vi } from 'vitest';
import { TxmWallet } from '../src/wallet.js';
import { txId, buildAndSign, selectUtxos } from '../src/tx.js';
import { TxmRPC } from '../src/rpc.js';
import { InsufficientBalance } from '../src/types.js';
import type { Utxo, TxOutput } from '../src/types.js';

// ── Test vectors (computed from Rust source) ──────────────────────────────────
const TEST_PRIV = '0101010101010101010101010101010101010101010101010101010101010101';
const TEST_PUB  = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const TEST_ADDR = 'txm178gjqyjqdwr6lvnldhgk4s98dlx6540dtczms0';
// 1 input (all-zero txid, index 0, empty sig) → 1 output (100_000_000 atoms, "txm1qtest")
const TX_VECTOR = 'f1502ea322ee70ca9761b78cec26c14986c67bfbea11e8435c5441d527893f7a';

// ── Wallet ────────────────────────────────────────────────────────────────────
describe('TxmWallet', () => {
  it('generates a random wallet with txm1 address', () => {
    const w = TxmWallet.generate();
    expect(w.address).toMatch(/^txm1/);
    expect(w.privateKeyHex).toHaveLength(64);
    expect(w.publicKeyHex).toHaveLength(66);
  });

  it('restores from private key — matches test vector', () => {
    const w = TxmWallet.fromPrivateKey(TEST_PRIV);
    expect(w.address).toBe(TEST_ADDR);
    expect(w.publicKeyHex).toBe(TEST_PUB);
    expect(w.privateKeyHex).toBe(TEST_PRIV);
  });

  it('two generated wallets have different addresses', () => {
    const a = TxmWallet.generate();
    const b = TxmWallet.generate();
    expect(a.address).not.toBe(b.address);
  });
});

// ── txId ──────────────────────────────────────────────────────────────────────
describe('txId', () => {
  it('matches Rust test vector', () => {
    const inputs = [{
      previous_output: { txid: new Uint8Array(32), output_index: 0 },
      signature_script: new Uint8Array(0),
    }];
    const outputs: TxOutput[] = [{ address: 'txm1qtest', value_atoms: 100_000_000n }];
    expect(txId(inputs, outputs)).toBe(TX_VECTOR);
  });

  it('different inputs produce different ids', () => {
    const inputs1 = [{ previous_output: { txid: new Uint8Array(32), output_index: 0 }, signature_script: new Uint8Array(0) }];
    const inputs2 = [{ previous_output: { txid: new Uint8Array(32).fill(1), output_index: 0 }, signature_script: new Uint8Array(0) }];
    const outputs: TxOutput[] = [{ address: 'txm1qtest', value_atoms: 100_000_000n }];
    expect(txId(inputs1, outputs)).not.toBe(txId(inputs2, outputs));
  });
});

// ── selectUtxos ───────────────────────────────────────────────────────────────
describe('selectUtxos', () => {
  const utxos: Utxo[] = [
    { txid: 'a'.repeat(64), output_index: 0, value_atoms: 50_000_000n, created_height: 1, mature: true },
    { txid: 'b'.repeat(64), output_index: 0, value_atoms: 80_000_000n, created_height: 2, mature: true },
    { txid: 'c'.repeat(64), output_index: 0, value_atoms: 20_000_000n, created_height: 3, mature: false },
  ];

  it('selects exact single UTXO when sufficient', () => {
    const selected = selectUtxos(utxos, 50_000_000n);
    expect(selected).toHaveLength(1);
    expect(selected[0].value_atoms).toBe(80_000_000n); // picks largest first
  });

  it('skips immature UTXOs', () => {
    const selected = selectUtxos(utxos, 100_000_000n);
    expect(selected.every(u => u.mature)).toBe(true);
    const total = selected.reduce((s, u) => s + u.value_atoms, 0n);
    expect(total).toBeGreaterThanOrEqual(100_000_000n);
  });

  it('throws InsufficientBalance when mature balance too low', () => {
    expect(() => selectUtxos(utxos, 200_000_000n)).toThrow(InsufficientBalance);
  });
});

// ── buildAndSign ──────────────────────────────────────────────────────────────
describe('buildAndSign', () => {
  it('produces correct RawTx structure', () => {
    const wallet = TxmWallet.fromPrivateKey(TEST_PRIV);
    const utxos: Utxo[] = [{
      txid: 'a'.repeat(64), output_index: 0,
      value_atoms: 200_000_000n, created_height: 1, mature: true,
    }];
    const outputs: TxOutput[] = [{ address: TEST_ADDR, value_atoms: 100_000_000n }];
    const tx = buildAndSign(wallet, utxos, outputs);

    expect(tx.id).toHaveLength(32);
    expect(tx.inputs).toHaveLength(1);
    expect(tx.outputs).toHaveLength(2); // payment + change back to wallet

    const sigScript = JSON.parse(Buffer.from(tx.inputs[0].signature_script).toString());
    expect(sigScript.public_key_hex).toBe(TEST_PUB);
    expect(sigScript.signature_hex).toMatch(/^[0-9a-f]+$/);
  });

  it('no change output when exact amount', () => {
    const wallet = TxmWallet.fromPrivateKey(TEST_PRIV);
    const utxos: Utxo[] = [{
      txid: 'a'.repeat(64), output_index: 0,
      value_atoms: 100_000_000n, created_height: 1, mature: true,
    }];
    const outputs: TxOutput[] = [{ address: TEST_ADDR, value_atoms: 100_000_000n }];
    const tx = buildAndSign(wallet, utxos, outputs);
    expect(tx.outputs).toHaveLength(1);
  });
});

// ── TxmRPC ────────────────────────────────────────────────────────────────────
describe('TxmRPC', () => {
  it('getBlockCount calls /getblockcount', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ height: 100, chain_id: 'tensorium-mainnet' }),
    });
    const rpc = new TxmRPC('https://rpc.example.com', mockFetch as any);
    const result = await rpc.getBlockCount();
    expect(result.height).toBe(100);
    expect(mockFetch).toHaveBeenCalledWith('https://rpc.example.com/getblockcount');
  });

  it('getUtxos calls correct URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tip_height: 100, utxo_count: 0, utxos: [], address: 'txm1test' }),
    });
    const rpc = new TxmRPC('https://rpc.example.com', mockFetch as any);
    await rpc.getUtxos('txm1qtest');
    expect(mockFetch).toHaveBeenCalledWith('https://rpc.example.com/getutxos/txm1qtest');
  });

  it('sendRawTransaction POSTs JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ txid: 'abc123' }),
    });
    const rpc = new TxmRPC('https://rpc.example.com', mockFetch as any);
    const tx = { id: [], inputs: [], outputs: [], payload: [] };
    const result = await rpc.sendRawTransaction(tx as any);
    expect(result.txid).toBe('abc123');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://rpc.example.com/sendrawtransaction');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual(tx);
  });
});
