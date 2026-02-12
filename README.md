# Geyser Pump.fun Sniper

Сервис для Solana, который подключается к Geyser gRPC, слушает события создания токенов в **Pump.fun** и автоматически покупает токены, которые совпадают с заданными `symbol`.

## Как работает

1. Подписывается на стрим Geyser gRPC и фильтрует транзакции, которые затрагивают программу Pump.fun (`6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`)
2. Декодирует каждую инструкцию `create` и извлекает `name`, `symbol`, `uri`
3. Сравнивает `symbol` со списком `TARGET_SYMBOLS` из `.env`
4. Если есть совпадение — собирает и отправляет транзакцию покупки через bonding curve Pump.fun

## Поток логов

```
Токен Pump.fun создан  { name, symbol, mint, slot }
Symbol совпал — начинаю покупку  { symbol, mint }
Транзакция покупки отправлена  { sig, mint }
Транзакция подтверждена  { sig }
```

## Требования

- **Node.js** ≥ 18
- **Geyser gRPC** endpoint (например, Triton/Helius или свой Yellowstone)
- Solana-кошелёк с SOL для покупок и комиссий

## Установка

```bash
# Клонирование и установка
git clone <repo-url> && cd geyser-pump-sniper
npm install

# Конфиг
cp .env.example .env
# Отредактируй .env — заполни GEYSER_ENDPOINT, PRIVATE_KEY, TARGET_SYMBOLS
```

Важно: параметры можно передавать через CLI — **флаги имеют приоритет над `.env`**.

### Переменные окружения

| Переменная | Обязательная | Описание |
|---|---|---|
| `GEYSER_ENDPOINT` | ✅ | URL Geyser gRPC |
| `GEYSER_TOKEN` | | Токен авторизации (если провайдер требует) |
| `RPC_URL` | | Solana RPC для отправки транзакций (по умолчанию: mainnet) |
| `PRIVATE_KEY` | ✅ | Приватный ключ кошелька в Base58 |
| `TARGET_SYMBOLS` | — | Не используется: передаётся только через `--targets` |
| `BUY_AMOUNT_SOL` | — | Не используется: передаётся только через `--buy-amount-sol` |
| `SLIPPAGE_BPS` | | Slippage в bps (по умолчанию: `500` = 5%) |
| `PUMP_FUN_PROGRAM_ID` | | ProgramId Pump.fun (опционально) |
| `PRIORITY_FEE_MICRO_LAMPORTS` | | Priority fee (по умолчанию: `100000`) |
| `LOG_LEVEL` | | `debug` / `info` / `warn` / `error` (по умолчанию: `info`) |

## Запуск

```bash
# Разработка (ts-node)
npm run dev

# Прод
npm run build
npm start
```

### Примеры CLI

```bash
# Обязательные параметры: цели (symbol) и сумма покупки
npm run dev -- --targets CAT,DOG --buy-amount-sol 0.02

# Переопределить RPC и priority fee
npm run dev -- --targets CAT,DOG --buy-amount-sol 0.02 --rpc-url https://api.mainnet-beta.solana.com --priority-fee-micro-lamports 200000
```

Поддерживаемые флаги CLI:

- `--geyser-endpoint`
- `--geyser-token`
- `--rpc-url`
- `--private-key`
- `--targets`
- `--buy-amount-sol`
- `--slippage-bps`
- `--priority-fee-micro-lamports`
- `--pump-program-id`

## Тесты и линтинг

```bash
# Unit + интеграционные тесты (Vitest)
npm test

# Тесты в watch-режиме
npm run test:watch

# Проверка типов
npm run typecheck

# Линтинг (ESLint + typescript-eslint)
npm run lint

# Автофикс
npm run lint:fix
```

Тесты покрывают:
- **Config** — парсинг, валидация, CLI-переопределения, полный пайплайн
- **Decoder** — декодирование/кодирование инструкций Pump.fun
- **Extract** — извлечение create-событий из транзакций Geyser
- **Buyer** — интеграционный тест с мок-RPC (init, buy success/failure, computation)
- **Tx pipeline** — полный пайплайн обработки транзакций

## Структура проекта

```
src/
  index.ts                        — точка входа (запуск + обработка fatal)
  app/
    main.ts                       — сборка конфига, CLI, старт стрима
  cli/
    buildCli.ts                   — описание CLI-флагов (commander)
  config/
    index.ts                      — реэкспорт всех модулей конфигурации
    types.ts                      — интерфейсы AppConfig, AppConfigOverrides
    parse.ts                      — парсинг env и символов
    overrides.ts                  — применение CLI-переопределений
    validate.ts                   — валидация конфигурации
    __tests__/                    — unit-тесты конфигурации
  lib/
    logger.ts                     — структурные логи (pino)
  services/
    geyser/
      types.ts                    — типы транзакций Geyser (TxMessage, TxMeta, PumpFunCreateEvent)
      extract.ts                  — чистые функции извлечения create-событий
      stream.ts                   — подписка на Geyser gRPC, обработка стрима
      __tests__/                  — unit-тесты extract
    pumpfun/
      constants.ts                — константы bonding curve Pump.fun
      decoder.ts                  — декодер/энкодер инструкций Pump.fun
      buyer.ts                    — класс Buyer: сборка и отправка транзакций
      __tests__/                  — unit-тесты decoder
  __tests__/                      — интеграционные тесты (config, tx pipeline, buyer)
eslint.config.mjs                 — конфиг ESLint (flat config)
```

## Дисклеймер

Этот софт предоставляется **только в образовательных целях**. Используешь на свой страх и риск. Автор(ы) не несут ответственности за финансовые потери.
