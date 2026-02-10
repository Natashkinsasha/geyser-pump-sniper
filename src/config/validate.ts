import type { AppConfig } from "./types";

/**
 * Валидирует конфигурацию. Бросает ошибку при некорректных значениях.
 * Чистая функция (только чтение + throw).
 */
export function validateConfig(cfg: Readonly<AppConfig>): void {
  const required: Array<keyof AppConfig> = ["geyserEndpoint", "privateKey"];
  for (const key of required) {
    const val = cfg[key];
    if (!val || (Array.isArray(val) && val.length === 0)) {
      throw new Error(`Отсутствует обязательный параметр: ${key}`);
    }
  }

  if (cfg.targetSymbols.length === 0) {
    throw new Error(
      "Список целей пуст. Передай --targets (например: --targets CAT,DOG)",
    );
  }

  if (!Number.isFinite(cfg.buyAmountSol) || cfg.buyAmountSol <= 0) {
    throw new Error(
      "Сумма покупки не задана. Передай --buy-amount-sol (например: --buy-amount-sol 0.01)",
    );
  }

  if (!Number.isFinite(cfg.slippageBps) || cfg.slippageBps < 0) {
    throw new Error("SLIPPAGE_BPS должен быть числом >= 0");
  }
}
