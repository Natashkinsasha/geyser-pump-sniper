import type { AppConfig } from "./types";

/**
 * Парсит строку символов через запятую в массив (uppercase, trim).
 * Чистая функция.
 */
export function parseTargetSymbols(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Создаёт AppConfig из переменных окружения.
 * targetSymbols и buyAmountSol намеренно пустые — они обязательны через CLI.
 * Чистая функция.
 */
export function configFromEnv(env: Readonly<NodeJS.ProcessEnv>): AppConfig {
  return {
    geyserEndpoint: env.GEYSER_ENDPOINT || "",
    geyserToken: env.GEYSER_TOKEN || "",

    rpcUrl: env.RPC_URL || "https://api.mainnet-beta.solana.com",
    privateKey: env.PRIVATE_KEY || "",

    targetSymbols: [],
    buyAmountSol: Number.NaN,
    slippageBps: parseInt(env.SLIPPAGE_BPS || "500", 10),
    priorityFeeMicroLamports: parseInt(
      env.PRIORITY_FEE_MICRO_LAMPORTS || "100000",
      10,
    ),

    pumpFunProgramId:
      env.PUMP_FUN_PROGRAM_ID ||
      "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  };
}
