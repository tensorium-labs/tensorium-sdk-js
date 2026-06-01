import type { RawTx } from './types.js';

type FetchFn = typeof fetch;

export class TxmRPC {
  private readonly url: string;
  private readonly fetchFn: FetchFn;

  constructor(url: string, fetchFn: FetchFn = fetch) {
    this.url = url.replace(/\/$/, '');
    this.fetchFn = fetchFn;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchFn(`${this.url}${path}`);
    if (!res.ok) throw new Error(`RPC ${path} → HTTP ${res.status}`);
    return res.json();
  }

  async getBlockCount(): Promise<{ height: number; chain_id: string }> {
    return this.get('/getblockcount');
  }

  async getUtxos(address: string): Promise<{
    tip_height: number;
    utxo_count: number;
    utxos: Array<{
      txid: string;
      output_index: number;
      value_atoms: number;
      created_height: number;
      mature: boolean;
    }>;
  }> {
    return this.get(`/getutxos/${encodeURIComponent(address)}`);
  }

  async sendRawTransaction(tx: RawTx): Promise<{ txid: string }> {
    const res = await this.fetchFn(`${this.url}/sendrawtransaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tx),
    });
    if (!res.ok) throw new Error(`sendRawTransaction → HTTP ${res.status}`);
    return res.json();
  }
}
