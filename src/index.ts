import dotenv from "dotenv";
dotenv.config();

import { logger } from "./lib/logger";
import { main } from "./app/main";

main().catch((err: unknown) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "Fatal error");
  process.exit(1);
});
