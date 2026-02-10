import dotenv from "dotenv";

import {
  applyConfigOverrides,
  configFromEnv,
  parseTargetSymbols,
  validateConfig,
} from "../config/index";
import { logger } from "../lib/logger";
import { startGeyserStream } from "../services/geyser/stream";
import { buildCli } from "../cli/buildCli";

export async function main(): Promise<void> {
  dotenv.config();

  const program = buildCli();
  program.parse();
  const opts = program.opts();

  const base = configFromEnv(process.env);
  const overrides = {
    targetSymbols: parseTargetSymbols(String(opts.targets)),
    buyAmountSol: parseFloat(String(opts.buyAmountSol)),
    slippageBps:
      opts.slippageBps !== undefined
        ? parseInt(String(opts.slippageBps), 10)
        : undefined,
    priorityFeeMicroLamports:
      opts.priorityFeeMicroLamports !== undefined
        ? parseInt(String(opts.priorityFeeMicroLamports), 10)
        : undefined,
    pumpFunProgramId: opts.pumpProgramId,
  };

  const cfg = applyConfigOverrides(base, overrides);
  validateConfig(cfg);

  logger.info("=== Geyser Pump.fun Sniper ===");
  logger.info(
    {
      targets: cfg.targetSymbols,
      buyAmountSol: cfg.buyAmountSol,
      slippageBps: cfg.slippageBps,
    },
    "Config loaded",
  );

  await startGeyserStream(cfg);
}
