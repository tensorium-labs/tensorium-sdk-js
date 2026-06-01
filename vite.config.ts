import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'TensoriumSdk',
      fileName: 'index',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['@noble/secp256k1', '@noble/hashes/sha256', 'bech32'],
    },
  },
  plugins: [dts({ include: ['src'] })],
});
