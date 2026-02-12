import { describe, it, expect } from "vitest";
import { validateConfig } from "../validate";
import type { AppConfig } from "../types";

function makeValidConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    geyserEndpoint: "http://localhost:10000",
    geyserToken: "token",
    rpcUrl: "http://localhost:8899",
    privateKey: "abc123privatekey",
    targetSymbols: ["TEST"],
    buyAmountSol: 0.01,
    slippageBps: 500,
    priorityFeeMicroLamports: 100000,
    pumpFunProgramId: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    ...overrides,
  };
}

describe("validateConfig", () => {
  it("does not throw for valid config", () => {
    expect(() => validateConfig(makeValidConfig())).not.toThrow();
  });

  it("throws when geyserEndpoint is missing", () => {
    expect(() => validateConfig(makeValidConfig({ geyserEndpoint: "" }))).toThrow(
      "geyserEndpoint",
    );
  });

  it("throws when privateKey is missing", () => {
    expect(() => validateConfig(makeValidConfig({ privateKey: "" }))).toThrow(
      "privateKey",
    );
  });

  it("throws when targetSymbols is empty", () => {
    expect(() => validateConfig(makeValidConfig({ targetSymbols: [] }))).toThrow(
      "целей пуст",
    );
  });

  it("throws when buyAmountSol is NaN", () => {
    expect(() => validateConfig(makeValidConfig({ buyAmountSol: NaN }))).toThrow(
      "buy-amount-sol",
    );
  });

  it("throws when buyAmountSol is 0", () => {
    expect(() => validateConfig(makeValidConfig({ buyAmountSol: 0 }))).toThrow(
      "buy-amount-sol",
    );
  });

  it("throws when buyAmountSol is negative", () => {
    expect(() => validateConfig(makeValidConfig({ buyAmountSol: -1 }))).toThrow(
      "buy-amount-sol",
    );
  });

  it("throws when slippageBps is negative", () => {
    expect(() => validateConfig(makeValidConfig({ slippageBps: -1 }))).toThrow(
      "SLIPPAGE_BPS",
    );
  });

  it("allows slippageBps of 0", () => {
    expect(() => validateConfig(makeValidConfig({ slippageBps: 0 }))).not.toThrow();
  });
});
