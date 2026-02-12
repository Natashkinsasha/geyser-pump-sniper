import { describe, it, expect } from "vitest";
import { parseTargetSymbols, configFromEnv } from "../parse";

describe("parseTargetSymbols", () => {
  it("splits comma-separated values and uppercases them", () => {
    expect(parseTargetSymbols("cat,dog,fish")).toEqual(["CAT", "DOG", "FISH"]);
  });

  it("trims whitespace around symbols", () => {
    expect(parseTargetSymbols(" cat , dog ")).toEqual(["CAT", "DOG"]);
  });

  it("filters out empty strings", () => {
    expect(parseTargetSymbols("cat,,dog,")).toEqual(["CAT", "DOG"]);
  });

  it("returns empty array for empty string", () => {
    expect(parseTargetSymbols("")).toEqual([]);
  });

  it("handles single symbol", () => {
    expect(parseTargetSymbols("TEST")).toEqual(["TEST"]);
  });
});

describe("configFromEnv", () => {
  it("reads values from env", () => {
    const env = {
      GEYSER_ENDPOINT: "http://localhost:10000",
      GEYSER_TOKEN: "mytoken",
      RPC_URL: "http://localhost:8899",
      PRIVATE_KEY: "abc123",
      SLIPPAGE_BPS: "300",
      PRIORITY_FEE_MICRO_LAMPORTS: "50000",
      PUMP_FUN_PROGRAM_ID: "CustomProgId",
    } as unknown as NodeJS.ProcessEnv;

    const cfg = configFromEnv(env);
    expect(cfg.geyserEndpoint).toBe("http://localhost:10000");
    expect(cfg.geyserToken).toBe("mytoken");
    expect(cfg.rpcUrl).toBe("http://localhost:8899");
    expect(cfg.privateKey).toBe("abc123");
    expect(cfg.slippageBps).toBe(300);
    expect(cfg.priorityFeeMicroLamports).toBe(50000);
    expect(cfg.pumpFunProgramId).toBe("CustomProgId");
  });

  it("uses defaults when env vars are missing", () => {
    const cfg = configFromEnv({} as NodeJS.ProcessEnv);
    expect(cfg.geyserEndpoint).toBe("");
    expect(cfg.rpcUrl).toBe("https://api.mainnet-beta.solana.com");
    expect(cfg.slippageBps).toBe(500);
    expect(cfg.priorityFeeMicroLamports).toBe(100000);
    expect(cfg.pumpFunProgramId).toBe("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
  });

  it("leaves targetSymbols empty and buyAmountSol as NaN", () => {
    const cfg = configFromEnv({} as NodeJS.ProcessEnv);
    expect(cfg.targetSymbols).toEqual([]);
    expect(cfg.buyAmountSol).toBeNaN();
  });
});
