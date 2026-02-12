const CREATE_DISCRIMINATOR = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);
const BUY_DISCRIMINATOR = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);

export interface DecodedCreate {
  name: string;
  symbol: string;
  uri: string;
}

export function isCreateInstruction(data: Readonly<Buffer> | Readonly<Uint8Array>): boolean {
  const buf = Buffer.from(data);
  return buf.subarray(0, 8).equals(CREATE_DISCRIMINATOR);
}

export function decodeCreateInstruction(
  data: Readonly<Buffer> | Readonly<Uint8Array>,
): DecodedCreate | null {
  if (!isCreateInstruction(data)) return null;

  try {
    const buf = Buffer.from(data);
    let offset = 8;

    // name: borsh-строка (u32 LE длина + utf8 bytes)
    const nameLen = buf.readUInt32LE(offset);
    offset += 4;
    const name = buf.subarray(offset, offset + nameLen).toString("utf8");
    offset += nameLen;

    // symbol: borsh-строка
    const symbolLen = buf.readUInt32LE(offset);
    offset += 4;
    const symbol = buf.subarray(offset, offset + symbolLen).toString("utf8");
    offset += symbolLen;

    // uri: borsh-строка
    const uriLen = buf.readUInt32LE(offset);
    offset += 4;
    const uri = buf.subarray(offset, offset + uriLen).toString("utf8");

    return { name, symbol, uri };
  } catch {
    return null;
  }
}

export function encodeBuyInstruction(
  tokenAmount: bigint,
  maxSolCost: bigint,
): Buffer {
  const data = Buffer.alloc(8 + 8 + 8);
  BUY_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(tokenAmount, 8);
  data.writeBigUInt64LE(maxSolCost, 16);
  return data;
}
