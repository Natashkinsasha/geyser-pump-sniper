/**
 * Реэкспорт всех модулей конфигурации.
 */
export type { AppConfig, AppConfigOverrides } from "./types";
export { parseTargetSymbols, configFromEnv } from "./parse";
export { applyConfigOverrides } from "./overrides";
export { validateConfig } from "./validate";
