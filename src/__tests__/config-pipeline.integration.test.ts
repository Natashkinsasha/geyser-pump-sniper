/**
 * Интеграционный тест: полный пайплайн конфигурации.
 * env → configFromEnv → applyConfigOverrides → validateConfig
 */
import { describe, it, expect } from "vitest";
import {
  configFromEnv,
  parseTargetSymbols,
  applyConfigOverrides,
  validateConfig,
} from "../config/index";

describe("Config pipeline (integration)", () => {
  const env = {
    GEYSER_ENDPOINT: "http://grpc.example.com:10000",
    GEYSER_TOKEN: "secret-token",
    RPC_URL: "http://rpc.example.com",
    PRIVATE_KEY: "3zomfESk75qVEvfPhJEx7Y7XGzm36nAuMu4fganVVdqz6hfyRwd1uoUQrzgupWQKY8qTNuRcfgESfmjJ8g1y8WCx",
    SLIPPAGE_BPS: "300",
    PRIORITY_FEE_MICRO_LAMPORTS: "200000",
  } as unknown as NodeJS.ProcessEnv;

  it("builds valid config from env + CLI overrides and validates it", () => {
    const base = configFromEnv(env);
    const overrides = {
      targetSymbols: parseTargetSymbols("CAT,DOG"),
      buyAmountSol: 0.5,
    };
    const cfg = applyConfigOverrides(base, overrides);

    expect(() => validateConfig(cfg)).not.toThrow();

    expect(cfg.geyserEndpoint).toBe("http://grpc.example.com:10000");
    expect(cfg.rpcUrl).toBe("http://rpc.example.com");
    expect(cfg.targetSymbols).toEqual(["CAT", "DOG"]);
    expect(cfg.buyAmountSol).toBe(0.5);
    expect(cfg.slippageBps).toBe(300);
    expect(cfg.priorityFeeMicroLamports).toBe(200000);
  });

  it("fails validation when CLI does not provide targets", () => {
    const base = configFromEnv(env);
    const overrides = {
      targetSymbols: parseTargetSymbols(""),
      buyAmountSol: 1,
    };
    const cfg = applyConfigOverrides(base, overrides);

    expect(() => validateConfig(cfg)).toThrow("целей пуст");
  });

  it("fails validation when CLI does not provide buyAmountSol", () => {
    const base = configFromEnv(env);
    const overrides = {
      targetSymbols: parseTargetSymbols("TEST"),
      buyAmountSol: NaN,
    };
    const cfg = applyConfigOverrides(base, overrides);

    expect(() => validateConfig(cfg)).toThrow("buy-amount-sol");
  });

  it("fails validation when env is missing required fields", () => {
    const emptyEnv = {} as NodeJS.ProcessEnv;
    const base = configFromEnv(emptyEnv);
    const overrides = {
      targetSymbols: parseTargetSymbols("TEST"),
      buyAmountSol: 1,
    };
    const cfg = applyConfigOverrides(base, overrides);

    expect(() => validateConfig(cfg)).toThrow("geyserEndpoint");
  });

  it("CLI slippageBps overrides env SLIPPAGE_BPS", () => {
    const base = configFromEnv(env);
    const overrides = {
      targetSymbols: parseTargetSymbols("X"),
      buyAmountSol: 0.01,
      slippageBps: 100,
    };
    const cfg = applyConfigOverrides(base, overrides);

    expect(cfg.slippageBps).toBe(100);
  });
});
