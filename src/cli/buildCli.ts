import { Command } from "commander";

export function buildCli(): Command {
  const program = new Command();

  program
    .name("geyser-pump-sniper")
    .description("Снайпер Pump.fun на базе Solana Geyser gRPC")
    .requiredOption(
      "--targets <symbols>",
      "Список symbol через запятую (например: CAT,DOG)",
    )
    .requiredOption(
      "--buy-amount-sol <number>",
      "Сколько SOL тратить на покупку",
    )
    .option("--slippage-bps <number>", "Slippage в bps (например 500 = 5%)")
    .option(
      "--priority-fee-micro-lamports <number>",
      "Priority fee в micro-lamports",
    )
    .option(
      "--pump-program-id <pubkey>",
      "ProgramId Pump.fun (если хочешь переопределить)",
    );

  return program;
}
