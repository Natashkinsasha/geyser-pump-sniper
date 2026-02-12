import { describe, it, expect } from "vitest";
import {
  isCreateInstruction,
  decodeCreateInstruction,
  encodeBuyInstruction,
} from "../decoder";

/** Helper: encode a borsh string (u32 LE length + utf8 bytes) */
function borshString(s: string): Buffer {
  const strBuf = Buffer.from(s, "utf8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(strBuf.length, 0);
  return Buffer.concat([lenBuf, strBuf]);
}

const CREATE_DISCRIMINATOR = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);
const BUY_DISCRIMINATOR = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);

function buildCreateInstruction(name: string, symbol: string, uri: string): Buffer {
  return Buffer.concat([
    CREATE_DISCRIMINATOR,
    borshString(name),
    borshString(symbol),
    borshString(uri),
  ]);
}

describe("isCreateInstruction", () => {
  it("returns true for create discriminator", () => {
    const data = buildCreateInstruction("Token", "TKN", "https://example.com");
    expect(isCreateInstruction(data)).toBe(true);
  });

  it("returns false for buy discriminator", () => {
    const data = Buffer.concat([BUY_DISCRIMINATOR, Buffer.alloc(16)]);
    expect(isCreateInstruction(data)).toBe(false);
  });

  it("returns false for random data", () => {
    const data = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(isCreateInstruction(data)).toBe(false);
  });

  it("returns false for empty buffer", () => {
    expect(isCreateInstruction(Buffer.alloc(0))).toBe(false);
  });
});

describe("decodeCreateInstruction", () => {
  it("decodes name, symbol, uri from valid create instruction", () => {
    const data = buildCreateInstruction("My Token", "MTK", "https://ipfs.io/abc");
    const result = decodeCreateInstruction(data);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("My Token");
    expect(result!.symbol).toBe("MTK");
    expect(result!.uri).toBe("https://ipfs.io/abc");
  });

  it("returns null for non-create instruction", () => {
    const data = Buffer.concat([BUY_DISCRIMINATOR, Buffer.alloc(16)]);
    expect(decodeCreateInstruction(data)).toBeNull();
  });

  it("returns null for truncated data", () => {
    const data = Buffer.concat([CREATE_DISCRIMINATOR, Buffer.alloc(2)]);
    expect(decodeCreateInstruction(data)).toBeNull();
  });

  it("handles empty strings", () => {
    const data = buildCreateInstruction("", "", "");
    const result = decodeCreateInstruction(data);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("");
    expect(result!.symbol).toBe("");
    expect(result!.uri).toBe("");
  });

  it("handles unicode characters", () => {
    const data = buildCreateInstruction("Тест", "🚀", "https://example.com/файл");
    const result = decodeCreateInstruction(data);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Тест");
    expect(result!.symbol).toBe("🚀");
  });
});

describe("encodeBuyInstruction", () => {
  it("produces 24-byte buffer with correct discriminator", () => {
    const buf = encodeBuyInstruction(1000n, 2000n);
    expect(buf.length).toBe(24);
    expect(buf.subarray(0, 8)).toEqual(BUY_DISCRIMINATOR);
  });

  it("encodes tokenAmount and maxSolCost as u64 LE", () => {
    const tokenAmount = 34277831558567n;
    const maxSolCost = 1050000000n;

    const buf = encodeBuyInstruction(tokenAmount, maxSolCost);
    expect(buf.readBigUInt64LE(8)).toBe(tokenAmount);
    expect(buf.readBigUInt64LE(16)).toBe(maxSolCost);
  });

  it("handles zero values", () => {
    const buf = encodeBuyInstruction(0n, 0n);
    expect(buf.readBigUInt64LE(8)).toBe(0n);
    expect(buf.readBigUInt64LE(16)).toBe(0n);
  });
});
