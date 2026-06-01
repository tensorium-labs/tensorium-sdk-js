export type Utxo = {
  txid: string;            // 64-char hex, no 0x prefix
  output_index: number;    // u32
  value_atoms: bigint;     // u64 — 1 TXM = 100_000_000 atoms
  created_height: number;
  mature: boolean;
};

export type TxOutput = {
  address: string;         // "txm1q..."
  value_atoms: bigint;
};

// Shape sent to /sendrawtransaction — matches Tensorium Rust serde output
export type RawTx = {
  id: number[];            // 32-byte array
  inputs: Array<{
    previous_output: { txid: number[]; output_index: number };
    signature_script: number[];  // UTF-8 bytes of JSON sig script
  }>;
  outputs: Array<{ value_atoms: number; address: string }>;
  payload: number[];
};

export class InsufficientBalance extends Error {
  constructor(have: bigint, need: bigint) {
    super(`Insufficient balance: have ${have} atoms, need ${need} atoms`);
    this.name = 'InsufficientBalance';
  }
}
