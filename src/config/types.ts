/** Полная конфигурация приложения (все поля readonly — конфиг иммутабелен после создания) */
export interface AppConfig {
  readonly geyserEndpoint: string;
  readonly geyserToken: string;

  readonly rpcUrl: string;
  readonly privateKey: string;

  readonly targetSymbols: readonly string[];
  readonly buyAmountSol: number;
  readonly slippageBps: number;
  readonly priorityFeeMicroLamports: number;

  readonly pumpFunProgramId: string;
}

/** Частичные переопределения конфигурации (из CLI) */
export type AppConfigOverrides = Readonly<Partial<{
  geyserEndpoint: string;
  geyserToken: string;
  rpcUrl: string;
  privateKey: string;
  targetSymbols: readonly string[];
  buyAmountSol: number;
  slippageBps: number;
  priorityFeeMicroLamports: number;
  pumpFunProgramId: string;
}>>;
