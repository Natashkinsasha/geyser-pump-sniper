import { describe, it, expect } from "vitest";
import bs58 from "bs58";
import { buildAccountKeys, extractPumpFunCreateEvents } from "../extract";
import type { TxMessage, TxMeta } from "../types";

const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const CREATE_DISCRIMINATOR = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);

/** Encode a borsh string (u32 LE length + utf8 bytes) */
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

/** Create a fake mint address (random 32 bytes, base58-encoded) */
function fakePubkey(): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

describe("buildAccountKeys", () => {
  it("returns base58-encoded keys from message.accountKeys", () => {
    const key = fakePubkey();
    const message: TxMessage = { accountKeys: [key] };
    const result = buildAccountKeys(message, undefined);

    expect(result).toEqual([bs58.encode(key)]);
  });

  it("appends writable and readonly addresses from meta", () => {
    const key1 = fakePubkey();
    const writable = fakePubkey();
    const readonly_ = fakePubkey();

    const message: TxMessage = { accountKeys: [key1] };
    const meta: TxMeta = {
      loadedWritableAddresses: [writable],
      loadedReadonlyAddresses: [readonly_],
    };

    const result = buildAccountKeys(message, meta);
    expect(result).toHaveLength(3);
    expect(result[1]).toBe(bs58.encode(writable));
    expect(result[2]).toBe(bs58.encode(readonly_));
  });

  it("handles empty accountKeys", () => {
    const message: TxMessage = { accountKeys: [] };
    expect(buildAccountKeys(message, undefined)).toEqual([]);
  });
});

describe("extractPumpFunCreateEvents", () => {
  it("extracts a create event from a valid transaction", () => {
    const mintKey = fakePubkey();
    const pumpKey = bs58.decode(PUMP_PROGRAM_ID);

    const message: TxMessage = {
      accountKeys: [mintKey, pumpKey],
      instructions: [
        {
          programIdIndex: 1,
          accounts: new Uint8Array([0]),
          data: new Uint8Array(buildCreateIxData("Test Token", "TEST", "https://example.com")),
        },
      ],
    };

    const events = extractPumpFunCreateEvents({
      pumpProgramId: PUMP_PROGRAM_ID,
      slot: "12345",
      message,
    });

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("Test Token");
    expect(events[0].symbol).toBe("TEST");
    expect(events[0].uri).toBe("https://example.com");
    expect(events[0].mint).toBe(bs58.encode(mintKey));
    expect(events[0].slot).toBe("12345");
  });

  it("returns empty array when pump program is not in accountKeys", () => {
    const message: TxMessage = {
      accountKeys: [fakePubkey()],
      instructions: [
        {
          programIdIndex: 0,
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

  it("skips non-create instructions", () => {
    const pumpKey = bs58.decode(PUMP_PROGRAM_ID);
    const nonCreateData = Buffer.alloc(24);
    nonCreateData.writeUInt8(0xff, 0);

    const message: TxMessage = {
      accountKeys: [fakePubkey(), pumpKey],
      instructions: [
        {
          programIdIndex: 1,
          accounts: new Uint8Array([0]),
          data: new Uint8Array(nonCreateData),
        },
      ],
    };

    const events = extractPumpFunCreateEvents({
      pumpProgramId: PUMP_PROGRAM_ID,
      message,
    });

    expect(events).toEqual([]);
  });

  it("handles multiple create events in one transaction", () => {
    const mint1 = fakePubkey();
    const mint2 = fakePubkey();
    const pumpKey = bs58.decode(PUMP_PROGRAM_ID);

    const message: TxMessage = {
      accountKeys: [mint1, mint2, pumpKey],
      instructions: [
        {
          programIdIndex: 2,
          accounts: new Uint8Array([0]),
          data: new Uint8Array(buildCreateIxData("Token A", "AAA", "https://a.com")),
        },
        {
          programIdIndex: 2,
          accounts: new Uint8Array([1]),
          data: new Uint8Array(buildCreateIxData("Token B", "BBB", "https://b.com")),
        },
      ],
    };

    const events = extractPumpFunCreateEvents({
      pumpProgramId: PUMP_PROGRAM_ID,
      message,
    });

    expect(events).toHaveLength(2);
    expect(events[0].symbol).toBe("AAA");
    expect(events[1].symbol).toBe("BBB");
  });

  it("handles empty instructions array", () => {
    const pumpKey = bs58.decode(PUMP_PROGRAM_ID);
    const message: TxMessage = {
      accountKeys: [pumpKey],
      instructions: [],
    };

    const events = extractPumpFunCreateEvents({
      pumpProgramId: PUMP_PROGRAM_ID,
      message,
    });

    expect(events).toEqual([]);
  });
});
