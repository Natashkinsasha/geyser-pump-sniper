import { logger } from "./lib/logger";
import { main } from "./app/main";

main().catch((err: any) => {
  logger.fatal({ err: err?.message || String(err) }, "Fatal error");
  process.exit(1);
});
