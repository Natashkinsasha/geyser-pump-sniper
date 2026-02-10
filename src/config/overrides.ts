import type { AppConfig, AppConfigOverrides } from "./types";

/**
 * Применяет частичные переопределения к базовому конфигу.
 * Пропускает undefined-поля.
 * Чистая функция — возвращает новый объект.
 */
export function applyConfigOverrides(
  base: Readonly<AppConfig>,
  overrides: Readonly<AppConfigOverrides>,
): AppConfig {
  return {
    geyserEndpoint: overrides.geyserEndpoint ?? base.geyserEndpoint,
    geyserToken: overrides.geyserToken ?? base.geyserToken,
    rpcUrl: overrides.rpcUrl ?? base.rpcUrl,
    privateKey: overrides.privateKey ?? base.privateKey,
    targetSymbols: overrides.targetSymbols ?? base.targetSymbols,
    buyAmountSol: overrides.buyAmountSol ?? base.buyAmountSol,
    slippageBps: overrides.slippageBps ?? base.slippageBps,
    priorityFeeMicroLamports:
      overrides.priorityFeeMicroLamports ?? base.priorityFeeMicroLamports,
    pumpFunProgramId: overrides.pumpFunProgramId ?? base.pumpFunProgramId,
  };
}
