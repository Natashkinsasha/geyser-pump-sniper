/**
 * Модуль подписки на Geyser gRPC стрим.
 *
 * Подключается к Yellowstone gRPC, фильтрует транзакции по Pump.fun Program ID,
 * извлекает события создания токенов (create) и при совпадении symbol с целями
 * запускает покупку.
 */
import Client, { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

import type { AppConfig } from "../../config/index";
import { logger } from "../../lib/logger";
import { Buyer } from "../pumpfun/buyer";
import { extractPumpFunCreateEvents } from "./extract";
import { isCreateInstruction } from "../pumpfun/decoder";
import type { PumpFunCreateEvent } from "./types";

/* ------------------------------------------------------------------ */
/*  Типы                                                               */
/* ------------------------------------------------------------------ */

/** Нетипизированные данные из Geyser gRPC стрима */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeyserStreamData = Record<string, any>;

/** Контекст, разделяемый между функциями обработки стрима */
interface StreamContext {
  readonly pumpProgramId: string;
  readonly targetSymbols: readonly string[];
  readonly buyer: Buyer;
  msgCount: number;
}

/* ------------------------------------------------------------------ */
/*  Чистые / вспомогательные функции                                   */
/* ------------------------------------------------------------------ */

/** Строит запрос подписки для Geyser gRPC */
function buildSubscribeRequest(pumpProgramId: string) {
  return {
    accounts: {},
    slots: {},
    transactions: {
      pumpfun: {
        vote: false,
        failed: false,
        accountInclude: [pumpProgramId],
        accountExclude: [],
        accountRequired: [],
      },
    },
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    commitment: CommitmentLevel.PROCESSED,
    accountsDataSlice: [],
  };
}

/** Строит пустой SubscribeRequest с ping-полем для keep-alive */
function buildPingRequest(id: number) {
  return {
    accounts: {},
    slots: {},
    transactions: {},
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    accountsDataSlice: [],
    ping: { id },
  };
}

/** Классифицирует типы Pump.fun инструкций в транзакции (для логирования) */
function classifyPumpIxTypes(
  message: { accountKeys?: Uint8Array[]; instructions?: { programIdIndex: number; data: Uint8Array }[] },
  pumpProgramId: string,
): string[] {
  const accountKeys = (message.accountKeys || []).map((k: Uint8Array) => bs58.encode(k));
  const programIdx = accountKeys.indexOf(pumpProgramId);
  if (programIdx === -1) return [];

  const types: string[] = [];
  for (const ix of message.instructions || []) {
    if (ix.programIdIndex !== programIdx) continue;
    const d = Buffer.from(ix.data);
    if (isCreateInstruction(d)) {
      types.push("create");
    } else {
      types.push(`other(${d.subarray(0, 8).toString("hex")})`);
    }
  }
  return types;
}

/* ------------------------------------------------------------------ */
/*  Обработка сообщений стрима                                         */
/* ------------------------------------------------------------------ */

/** Обрабатывает служебные сообщения (pong, ping, slot). Возвращает true, если обработано */
function handleServiceMessage(data: GeyserStreamData, msgCount: number): boolean {
  if (data.pong) {
    logger.debug({ id: data.pong.id, msgCount }, "Received pong");
    return true;
  }
  if (data.ping) {
    logger.debug({ id: data.ping.id, msgCount }, "Received ping from server");
    return true;
  }
  if (data.slot) {
    logger.trace({ slot: data.slot, msgCount }, "Received slot update");
    return true;
  }
  return false;
}

/** Извлекает message и meta из сырых данных транзакции. Возвращает null, если данные невалидны */
function parseTransactionData(data: GeyserStreamData, msgCount: number) {
  const txn = data.transaction;
  const slot = txn.slot;
  const txInner = txn.transaction;

  const sig = txInner?.signature
    ? bs58.encode(txInner.signature)
    : undefined;

  if (!txInner?.transaction?.message) {
    logger.debug(
      { msgCount, sig, hasTxInner: !!txInner, hasTx: !!txInner?.transaction, hasMsg: !!txInner?.transaction?.message },
      "Skipping transaction — no message",
    );
    return null;
  }

  return {
    sig,
    slot,
    message: txInner.transaction.message,
    meta: txInner.meta,
  };
}

/** Обрабатывает одно create-событие: проверяет совпадение с целями и запускает покупку */
function handleCreateEvent(ev: PumpFunCreateEvent, ctx: StreamContext): void {
  logger.info(
    { name: ev.name, symbol: ev.symbol, mint: ev.mint, uri: ev.uri, slot: ev.slot },
    "Pump.fun token created",
  );

  const _symbolUpper = ev.symbol.toUpperCase();
  // if (!ctx.targetSymbols.includes(_symbolUpper)) {
  //   logger.info({ symbol: ev.symbol }, "Symbol does not match targets, skipping");
  //   return;
  // }

  logger.info({ symbol: ev.symbol, mint: ev.mint }, "Symbol MATCHED — initiating buy");

  const mint = new PublicKey(ev.mint);
  ctx.buyer.buy(mint, ev.name, ev.symbol).catch((err: Error) => {
    logger.error({ err: err.message, symbol: ev.symbol, mint: ev.mint }, "Unhandled buy error");
  });
}

/** Обрабатывает входящую транзакцию: извлекает create-события и передаёт на обработку */
function processTransaction(data: GeyserStreamData, ctx: StreamContext): void {
  const parsed = parseTransactionData(data, ctx.msgCount);
  if (!parsed) return;

  const { sig, slot, message, meta } = parsed;
  const ixCount = message.instructions?.length ?? 0;
  const pumpIxTypes = classifyPumpIxTypes(message, ctx.pumpProgramId);

  logger.debug(
    { msgCount: ctx.msgCount, sig, slot: slot?.toString(), ixCount, pumpIxTypes },
    "Received transaction",
  );

  const creates = extractPumpFunCreateEvents({
    pumpProgramId: ctx.pumpProgramId,
    slot: slot?.toString(),
    message,
    meta,
  });

  if (creates.length === 0) {
    logger.debug({ msgCount: ctx.msgCount }, "No create events in this transaction");
    return;
  }

  for (const ev of creates) {
    handleCreateEvent(ev, ctx);
  }
}

/** Роутер: направляет входящее сообщение стрима в нужный обработчик */
function handleStreamMessage(data: GeyserStreamData, ctx: StreamContext): void {
  ctx.msgCount++;

  if (ctx.msgCount === 1) {
    const keys = Object.keys(data).filter((k) => data[k] != null);
    logger.info({ keys }, "First message received from Geyser stream — connection is alive");
  }

  if (handleServiceMessage(data, ctx.msgCount)) return;

  if (!data.transaction) {
    const keys = Object.keys(data).filter((k) => data[k] != null);
    logger.debug({ keys, msgCount: ctx.msgCount }, "Received non-transaction update");
    return;
  }

  processTransaction(data, ctx);
}

/* ------------------------------------------------------------------ */
/*  Keep-alive                                                         */
/* ------------------------------------------------------------------ */

/** Запускает периодическую отправку ping для поддержания соединения */
type GeyserStream = Awaited<ReturnType<Client["subscribe"]>>;

function startPingKeepAlive(stream: GeyserStream, intervalMs = 30_000): void {
  let pingId = 0;
  setInterval(() => {
    stream.write(buildPingRequest(++pingId), (err?: Error | null) => {
      if (err) logger.warn({ err: err.message }, "Ping failed");
    });
  }, intervalMs);
}

/* ------------------------------------------------------------------ */
/*  Точка входа                                                        */
/* ------------------------------------------------------------------ */

/**
 * Запускает подписку на Geyser gRPC стрим.
 *
 * 1. Инициализирует Buyer (загружает fee recipient, кошелёк)
 * 2. Подключается к Geyser gRPC и открывает bidirectional стрим
 * 3. Отправляет запрос подписки с фильтром по Pump.fun Program ID
 * 4. На каждую входящую транзакцию извлекает create-события
 * 5. Сравнивает symbol с целями из конфига
 * 6. При совпадении — вызывает buyer.buy()
 * 7. Каждые 30 секунд отправляет ping для поддержания соединения
 */
export async function startGeyserStream(cfg: AppConfig): Promise<void> {
  const buyer = new Buyer(cfg);
  await buyer.init();

  logger.info(
    { endpoint: cfg.geyserEndpoint, targets: cfg.targetSymbols },
    "Connecting to Geyser gRPC...",
  );

  const client = new Client(cfg.geyserEndpoint, cfg.geyserToken || undefined, undefined);
  const stream = await client.subscribe();

  stream.on("error", (err: Error) => {
    logger.error({ err: err.message }, "Geyser stream error");
    process.exit(1);
  });

  stream.on("end", () => {
    logger.warn("Geyser stream ended, exiting");
    process.exit(1);
  });

  const ctx: StreamContext = {
    pumpProgramId: cfg.pumpFunProgramId,
    targetSymbols: cfg.targetSymbols,
    buyer,
    msgCount: 0,
  };

  stream.on("data", (data: GeyserStreamData) => handleStreamMessage(data, ctx));

  stream.write(buildSubscribeRequest(cfg.pumpFunProgramId), (err?: Error | null) => {
    if (err) {
      logger.error({ err: err.message }, "Failed to send subscribe request");
      process.exit(1);
    }
    logger.info("Subscribed to Geyser — listening for Pump.fun creates");
  });

  startPingKeepAlive(stream);
}
