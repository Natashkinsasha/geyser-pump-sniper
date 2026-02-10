/** Структура сообщения транзакции из Geyser gRPC (упрощённая типизация, readonly) */
export type TxMessage = {
  /** Массив публичных ключей аккаунтов, участвующих в транзакции (raw bytes) */
  readonly accountKeys?: readonly Uint8Array[];
  /** Список инструкций транзакции */
  readonly instructions?: readonly {
    /** Индекс program ID в массиве accountKeys */
    readonly programIdIndex: number;
    /** Индексы аккаунтов, передаваемых в инструкцию */
    readonly accounts: Uint8Array;
    /** Бинарные данные инструкции */
    readonly data: Uint8Array;
  }[];
};

/** Метаданные транзакции — дополнительные адреса из Address Lookup Tables */
export type TxMeta = {
  /** Writable-адреса, загруженные из ALT */
  readonly loadedWritableAddresses?: readonly Uint8Array[];
  /** Readonly-адреса, загруженные из ALT */
  readonly loadedReadonlyAddresses?: readonly Uint8Array[];
};

/** Событие создания нового токена в Pump.fun (иммутабельный результат) */
export type PumpFunCreateEvent = {
  /** Название токена */
  readonly name: string;
  /** Тикер (symbol) токена */
  readonly symbol: string;
  /** URI метаданных токена */
  readonly uri: string;
  /** Адрес mint-аккаунта токена (base58) */
  readonly mint: string;
  /** Номер слота, в котором произошла транзакция */
  readonly slot?: string;
};
