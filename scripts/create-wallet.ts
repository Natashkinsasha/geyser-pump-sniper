// wallet-generator.ts
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// Generate a new random keypair
const keypair = Keypair.generate();

console.log('Public key:', keypair.publicKey.toBase58());
console.log('Secret key (DO NOT SHARE):', bs58.encode(keypair.secretKey));