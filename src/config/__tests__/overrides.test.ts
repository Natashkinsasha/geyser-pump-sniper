import { describe, it, expect } from "vitest";
import { applyConfigOverrides } from "../overrides";
import type { AppConfig } from "../types";

const baseConfig: AppConfig = {
  geyserEndpoint: "http://base-endpoint",
  geyserToken: "base-token",
  rpcUrl: "http://base-rpc",
  privateKey: "base-key",
  targetSymbols: ["BASE"],
  buyAmountSol: 1,
  slippageBps: 500,
  priorityFeeMicroLamports: 100000,
  pumpFunProgramId: "baseProgramId",
};

describe("applyConfigOverrides", () => {
  it("returns base config when overrides are empty", () => {
    const result = applyConfigOverrides(baseConfig, {});
    expect(result).toEqual(baseConfig);
  });

  it("overrides only specified fields", () => {
    const result = applyConfigOverrides(baseConfig, {
      targetSymbols: ["CAT", "DOG"],
      buyAmountSol: 0.5,
    });

    expect(result.targetSymbols).toEqual(["CAT", "DOG"]);
    expect(result.buyAmountSol).toBe(0.5);
    expect(result.geyserEndpoint).toBe("http://base-endpoint");
    expect(result.slippageBps).toBe(500);
  });

  it("overrides all fields when all are provided", () => {
    const overrides = {
      geyserEndpoint: "http://new-endpoint",
      geyserToken: "new-token",
      rpcUrl: "http://new-rpc",
      privateKey: "new-key",
      targetSymbols: ["NEW"] as readonly string[],
      buyAmountSol: 2,
      slippageBps: 100,
      priorityFeeMicroLamports: 200000,
      pumpFunProgramId: "newProgramId",
    };

    const result = applyConfigOverrides(baseConfig, overrides);
    expect(result).toEqual(overrides);
  });

  it("does not mutate the base config", () => {
    const baseCopy = { ...baseConfig };
    applyConfigOverrides(baseConfig, { buyAmountSol: 99 });
    expect(baseConfig).toEqual(baseCopy);
  });
});
