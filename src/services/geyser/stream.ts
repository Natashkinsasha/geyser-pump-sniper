/**
 * Модуль подписки на Geyser gRPC стрим.
 *
 * Подключается к Yellowstone gRPC, фильтрует транзакции по Pump.fun Program ID,
 * извлекает события создания токенов (create) и при совпадении symbol с целями
 * запускает покупку.
 */
import Client, { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import { PublicKey } from "@solana/web3.js";

import type { AppConfig } from "../../config/index";
import { logger } from "../../lib/logger";
import { Buyer } from "../pumpfun/buyer";
import { extractPumpFunCreateEvents } from "./extract";

/**
 * Запускает подписку на Geyser gRPC стрим.
 *
 * Основной flow:
 * 1. Инициализирует Buyer (загружает fee recipient, кошелёк)
 * 2. Подключается к Geyser gRPC и открывает bidirectional стрим
 * 3. Отправляет запрос подписки с фильтром по Pump.fun Program ID
 * 4. На каждую входящую транзакцию извлекает create-события
 * 5. Сравнивает symbol с целями из конфига
 * 6. При совпадении — вызывает buyer.buy()
 * 7. Каждые 30 секунд отправляет ping для поддержания соединения
 */
export async function startGeyserStream(cfg: AppConfig): Promise<void> {
  const pumpProgramId = cfg.pumpFunProgramId;

  // Инициализация покупателя: загрузка кошелька и fee recipient
  const buyer = new Buyer(cfg);
  await buyer.init();

  logger.info(
    { endpoint: cfg.geyserEndpoint, targets: cfg.targetSymbols },
    "Connecting to Geyser gRPC...",
  );

  // Создаём gRPC клиент и открываем bidirectional стрим
  const client = new Client(
    cfg.geyserEndpoint,
    cfg.geyserToken || undefined,
    undefined,
  );
  const stream = await client.subscribe();

  // Обработка ошибок стрима — завершаем процесс при разрыве
  stream.on("error", (err: Error) => {
    logger.error({ err: err.message }, "Geyser stream error");
    process.exit(1);
  });

  stream.on("end", () => {
    logger.warn("Geyser stream ended, exiting");
    process.exit(1);
  });

  // Обработка входящих данных стрима
  stream.on("data", (data: any) => {
    // Пропускаем пакеты без транзакций (ping-ответы и т.д.)
    if (!data.transaction) return;

    const txn = data.transaction;
    const slot = txn.slot;
    const txInner = txn.transaction;
    if (!txInner?.transaction?.message) return;

    // Извлекаем message (инструкции + аккаунты) и meta (ALT-адреса)
    const message = txInner.transaction.message;
    const meta = txInner.meta;

    const creates = extractPumpFunCreateEvents({
      pumpProgramId: pumpProgramId,
      slot: slot?.toString(),
      message,
      meta,
    });

    // Обрабатываем каждое create-событие
    for (const ev of creates) {
      logger.info(
        {
          name: ev.name,
          symbol: ev.symbol,
          mint: ev.mint,
          uri: ev.uri,
          slot: ev.slot,
        },
        "Pump.fun token created",
      );

      // Проверяем, совпадает ли symbol с нашими целями (регистронезависимо)
      const symbolUpper = ev.symbol.toUpperCase();
      if (!cfg.targetSymbols.includes(symbolUpper)) {
        logger.debug(
          { symbol: ev.symbol },
          "Symbol does not match targets, skipping",
        );
        continue;
      }

      logger.info(
        { symbol: ev.symbol, mint: ev.mint },
        "Symbol MATCHED — initiating buy",
      );

      // Запускаем покупку асинхронно, не блокируя обработку стрима
      const mint = new PublicKey(ev.mint);
      buyer.buy(mint).then((sig) => {
        if (sig) {
          logger.info(
            { sig, symbol: ev.symbol, mint: ev.mint },
            "Buy complete",
          );
        }
      });
    }
  });

  // Формируем запрос подписки:
  // - Фильтруем только транзакции, где Pump.fun Program ID в accountInclude
  // - vote: false — исключаем голосования валидаторов
  // - failed: false — пропускаем неуспешные транзакции
  // - commitment: PROCESSED — получаем транзакции максимально быстро (до finalization)
  const request = {
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

  // Отправляем запрос подписки в gRPC стрим
  stream.write(request, (err: any) => {
    if (err) {
      logger.error({ err: err.message }, "Failed to send subscribe request");
      process.exit(1);
    }
    logger.info("Subscribed to Geyser — listening for Pump.fun creates");
  });

  // Keep-alive: отправляем ping каждые 30 секунд, чтобы сервер не закрыл соединение
  // Нужно передавать полный SubscribeRequest со всеми полями, иначе protobuf-сериализация упадёт
  let pingId = 0;
  setInterval(() => {
    stream.write(
      {
        accounts: {},
        slots: {},
        transactions: {},
        transactionsStatus: {},
        blocks: {},
        blocksMeta: {},
        entry: {},
        accountsDataSlice: [],
        ping: { id: ++pingId },
      },
      (err: any) => {
        if (err) logger.warn({ err: err.message }, "Ping failed");
      },
    );
  }, 30_000);
}
