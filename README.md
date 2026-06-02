# @tensorium/sdk

JavaScript / TypeScript SDK for the [Tensorium](https://tensoriumlabs.com) Proof-of-Work chain.

## Install

```bash
npm install @tensorium/sdk
```

## Quick Start

```typescript
import { TxmWallet, TxmRPC, send } from '@tensorium/sdk';

const rpc    = new TxmRPC('https://mc-rpc.tensoriumlabs.com');
const wallet = TxmWallet.fromPrivateKey(process.env.TXM_PRIVATE_KEY!);

// Check balance
const { utxos } = await rpc.getUtxos(wallet.address);
const balance = utxos
  .filter(u => u.mature)
  .reduce((s, u) => s + BigInt(u.value_atoms), 0n);
console.log('Balance:', balance, 'atoms');

// Send 1 TXM (100_000_000 atoms)
const txid = await send(rpc, wallet, 'txm1q...destination', 100_000_000n);
console.log('Sent:', txid);
```

## API

### `TxmWallet`

| Method | Description |
|---|---|
| `TxmWallet.generate()` | Create a new random wallet |
| `TxmWallet.fromPrivateKey(hex)` | Restore from 64-char hex private key |
| `.address` | `txm1q…` bech32 address |
| `.publicKeyHex` | 66-char compressed secp256k1 pubkey |
| `.privateKeyHex` | 64-char private key — keep secret |

### `TxmRPC`

| Method | Description |
|---|---|
| `new TxmRPC(url)` | Create RPC client |
| `.getBlockCount()` | `{ height, chain_id }` |
| `.getUtxos(address)` | `{ tip_height, utxos[] }` |
| `.sendRawTransaction(tx)` | Broadcast signed tx → `{ txid }` |

### `send(rpc, wallet, to, atoms, payload?)`

High-level: select UTXOs → build → sign → broadcast. Returns txid string.

### `selectUtxos(utxos, targetAtoms)`

Greedy UTXO selection (mature only, largest first). Throws `InsufficientBalance` if balance too low.

### `txId(inputs, outputs, payload?)`

Compute transaction hash (double SHA-256) matching the Tensorium node exactly.

### `buildAndSign(wallet, utxos, outputs, payload?)`

Build and sign a raw transaction. Adds change output automatically.

## Chain Details

| Property | Value |
|---|---|
| 1 TXM | 100,000,000 atoms |
| Address prefix | `txm1q…` (bech32) |
| Curve | secp256k1 |
| Hash | SHA-256d |
| RPC | `https://mc-rpc.tensoriumlabs.com` |

## Links

- [Tensorium Labs](https://tensoriumlabs.com)
- [Block Explorer](https://explorer.tensoriumlabs.com)
- [Docs](https://docs.tensoriumlabs.com)
- [GitHub](https://github.com/tensorium-labs/tensorium-sdk-js)

## License

MIT
