/**
 * Чистые функции для извлечения create-событий Pump.fun из транзакций.
 * Без побочных эффектов.
 */
import bs58 from "bs58";

import type { TxMessage, TxMeta, PumpFunCreateEvent } from "./types";
import {
  decodeCreateInstruction,
  isCreateInstruction,
} from "../pumpfun/decoder";

/**
 * Собирает полный список адресов аккаунтов транзакции.
 *
 * Объединяет статические ключи из message.accountKeys
 * и динамические адреса из Address Lookup Tables (meta).
 * Все ключи конвертируются из raw bytes в base58.
 *
 * Чистая функция — без побочных эффектов.
 */
export function buildAccountKeys(
  message: Readonly<TxMessage>,
  meta: Readonly<TxMeta> | undefined,
): string[] {
  const accountKeys: string[] = (message.accountKeys || []).map((k) =>
    bs58.encode(k),
  );

  // Добавляем writable-адреса из Address Lookup Tables
  if (meta?.loadedWritableAddresses) {
    for (const addr of meta.loadedWritableAddresses) {
      accountKeys.push(bs58.encode(addr));
    }
  }
  // Добавляем readonly-адреса из Address Lookup Tables
  if (meta?.loadedReadonlyAddresses) {
    for (const addr of meta.loadedReadonlyAddresses) {
      accountKeys.push(bs58.encode(addr));
    }
  }

  return accountKeys;
}

/**
 * Извлекает события создания токенов Pump.fun из транзакции.
 *
 * Чистая функция: принимает данные транзакции, возвращает массив событий.
 * 1. Собирает все account keys (статические + ALT)
 * 2. Ищет Pump.fun Program ID среди них
 * 3. Проходит по инструкциям, фильтрует по programIdIndex
 * 4. Проверяет дискриминатор create-инструкции
 * 5. Декодирует name, symbol, uri и определяет mint-адрес
 */
export function extractPumpFunCreateEvents(input: Readonly<{
  pumpProgramId: string;
  slot?: string;
  message: Readonly<TxMessage>;
  meta?: Readonly<TxMeta>;
}>): PumpFunCreateEvent[] {
  const { pumpProgramId, message, meta, slot } = input;

  // Собираем полный список адресов транзакции
  const accountKeys = buildAccountKeys(message, meta);

  // Ищем индекс Pump.fun программы; если нет — транзакция не наша
  const programIdx = accountKeys.indexOf(pumpProgramId);
  if (programIdx === -1) return [];

  const events: PumpFunCreateEvent[] = [];

  for (const ix of message.instructions || []) {
    // Пропускаем инструкции, не адресованные Pump.fun
    if (ix.programIdIndex !== programIdx) continue;

    const ixData = Buffer.from(ix.data);
    // Проверяем 8-байтовый дискриминатор create-инструкции
    if (!isCreateInstruction(ixData)) continue;

    // Декодируем поля: name, symbol, uri
    const decoded = decodeCreateInstruction(ixData);
    if (!decoded) continue;

    // Первый аккаунт инструкции — mint-адрес нового токена
    const ixAccounts: number[] = Array.from(ix.accounts);
    const mintAddr = accountKeys[ixAccounts[0]];
    if (!mintAddr) continue;

    events.push({
      name: decoded.name,
      symbol: decoded.symbol,
      uri: decoded.uri,
      mint: mintAddr,
      slot,
    });
  }

  return events;
}
