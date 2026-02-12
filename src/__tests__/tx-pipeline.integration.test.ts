/**
 * Интеграционный тест: пайплайн обработки транзакции.
 * Строим реалистичные данные Geyser → decode → extract → create events.
 *
 * Проверяем, что цепочка decoder + extract корректно работает вместе
 * на данных, приближенных к реальному формату gRPC стрима.
 */
import { describe, it, expect } from "vitest";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { extractPumpFunCreateEvents } from "../services/geyser/extract";
import {
  isCreateInstruction,
  decodeCreateInstruction,
  encodeBuyInstruction,
} from "../services/pumpfun/decoder";
import type { TxMessage, TxMeta } from "../services/geyser/types";

const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const CREATE_DISCRIMINATOR = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);

function borshString(s: string): Buffer {
  const strBuf = Buffer.from(s, "utf8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(strBuf.length, 0);
  return Buffer.concat([lenBuf, strBuf]);
}

function buildCreateIxData(name: string, symbol: string, uri: string): Buffer {
  return Buffer.concat([
    CREATE_DISCRIMINATOR,
    borshString(name),
    borshString(symbol),
    borshString(uri),
  ]);
}

/**
 * Строит реалистичную структуру транзакции, похожую на то,
 * что приходит из Geyser gRPC стрима.
 */
function buildGeyserTransaction(opts: {
  mintPubkey: Uint8Array;
  pumpProgramPubkey: Uint8Array;
  signerPubkey: Uint8Array;
  createName: string;
  createSymbol: string;
  createUri: string;
  slot: string;
  extraInstructions?: TxMessage["instructions"];
  altWritableAddresses?: Uint8Array[];
}) {
  const ixData = buildCreateIxData(opts.createName, opts.createSymbol, opts.createUri);

  const message: TxMessage = {
    accountKeys: [opts.mintPubkey, opts.signerPubkey, opts.pumpProgramPubkey],
    instructions: [
      {
        programIdIndex: 2,
        accounts: new Uint8Array([0, 1]),
        data: new Uint8Array(ixData),
      },
      ...(opts.extraInstructions || []),
    ],
  };

  const meta: TxMeta | undefined = opts.altWritableAddresses
    ? { loadedWritableAddresses: opts.altWritableAddresses }
    : undefined;

  return { message, meta, slot: opts.slot };
}

describe("Transaction pipeline (integration)", () => {
  const mintKeypair = Keypair.generate();
  const signerKeypair = Keypair.generate();
  const pumpProgramKey = bs58.decode(PUMP_PROGRAM_ID);

  it("full pipeline: raw IX data → isCreate → decode → extract events", () => {
    const name = "Solana Cat";
    const symbol = "SCAT";
    const uri = "https://ipfs.io/ipfs/Qm123abc";

    const ixData = buildCreateIxData(name, symbol, uri);

    // Step 1: decoder identifies it as create
    expect(isCreateInstruction(ixData)).toBe(true);

    // Step 2: decoder decodes fields
    const decoded = decodeCreateInstruction(ixData);
    expect(decoded).not.toBeNull();
    expect(decoded!.name).toBe(name);
    expect(decoded!.symbol).toBe(symbol);
    expect(decoded!.uri).toBe(uri);

    // Step 3: extract finds events in full transaction context
    const { message, meta, slot } = buildGeyserTransaction({
      mintPubkey: mintKeypair.publicKey.toBytes(),
      pumpProgramPubkey: pumpProgramKey,
      signerPubkey: signerKeypair.publicKey.toBytes(),
      createName: name,
      createSymbol: symbol,
      createUri: uri,
      slot: "100500",
    });

    const events = extractPumpFunCreateEvents({
      pumpProgramId: PUMP_PROGRAM_ID,
      slot,
      message,
      meta,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      name,
      symbol,
      uri,
      mint: mintKeypair.publicKey.toBase58(),
      slot: "100500",
    });
  });

  it("filters out non-create instructions in mixed transaction", () => {
    const buyData = encodeBuyInstruction(1000n, 2000n);

    const { message, meta, slot } = buildGeyserTransaction({
      mintPubkey: mintKeypair.publicKey.toBytes(),
      pumpProgramPubkey: pumpProgramKey,
      signerPubkey: signerKeypair.publicKey.toBytes(),
      createName: "Mixed Token",
      createSymbol: "MIX",
      createUri: "https://example.com",
      slot: "200",
      extraInstructions: [
        {
          programIdIndex: 2,
          accounts: new Uint8Array([0, 1]),
          data: new Uint8Array(buyData),
        },
      ],
    });

    const events = extractPumpFunCreateEvents({
      pumpProgramId: PUMP_PROGRAM_ID,
      slot,
      message,
      meta,
    });

    // Only the create event, not the buy
    expect(events).toHaveLength(1);
    expect(events[0].symbol).toBe("MIX");
  });

  it("resolves mint address from ALT (Address Lookup Table)", () => {
    const altMint = Keypair.generate();

    const ixData = buildCreateIxData("ALT Token", "ALT", "https://alt.com");

    // accountKeys has only signer + pump program (indices 0, 1)
    // mint is in ALT writable addresses (index 2)
    const message: TxMessage = {
      accountKeys: [
        signerKeypair.publicKey.toBytes(),
        pumpProgramKey,
      ],
      instructions: [
        {
          programIdIndex: 1,
          accounts: new Uint8Array([2, 0]),  // mint at index 2 (ALT), signer at 0
          data: new Uint8Array(ixData),
        },
      ],
    };

    const meta: TxMeta = {
      loadedWritableAddresses: [altMint.publicKey.toBytes()],
    };

    const events = extractPumpFunCreateEvents({
      pumpProgramId: PUMP_PROGRAM_ID,
      slot: "300",
      message,
      meta,
    });

    expect(events).toHaveLength(1);
    expect(events[0].mint).toBe(altMint.publicKey.toBase58());
    expect(events[0].symbol).toBe("ALT");
  });

  it("returns empty events for transaction without pump program", () => {
    const otherProgram = Keypair.generate();

    const message: TxMessage = {
      accountKeys: [
        mintKeypair.publicKey.toBytes(),
        otherProgram.publicKey.toBytes(),
      ],
      instructions: [
        {
          programIdIndex: 1,
          accounts: new Uint8Array([0]),
          data: new Uint8Array(buildCreateIxData("X", "X", "x")),
        },
      ],
    };

    const events = extractPumpFunCreateEvents({
      pumpProgramId: PUMP_PROGRAM_ID,
      message,
    });

    expect(events).toEqual([]);
  });
});
