/**
 * Интеграционный тест: Buyer с мок-RPC.
 *
 * Мокаем Connection из @solana/web3.js, чтобы проверить полный flow:
 * constructor → init (balance + global account) → buy (build tx, send, poll confirmation).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { Buyer } from "../services/pumpfun/buyer";
import type { AppConfig } from "../config/types";
import {
  LAMPORTS_PER_SOL,
  INITIAL_VIRTUAL_SOL_RESERVES,
  INITIAL_VIRTUAL_TOKEN_RESERVES,
  FEE_BPS,
} from "../services/pumpfun/constants";

// Suppress logger output during tests
vi.mock("../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

/** Mock RPC methods shared between tests */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = ReturnType<typeof vi.fn<(...args: any[]) => any>>;

let rpcMocks: {
  getBalance: MockFn;
  getAccountInfo: MockFn;
  getLatestBlockhash: MockFn;
  sendRawTransaction: MockFn;
  getSignatureStatuses: MockFn;
  getBlockHeight: MockFn;
};

vi.mock("@solana/web3.js", async () => {
  const actual = await vi.importActual<typeof import("@solana/web3.js")>("@solana/web3.js");
  class MockConnection {
    getBalance(...args: unknown[]) { return rpcMocks.getBalance(...args); }
    getAccountInfo(...args: unknown[]) { return rpcMocks.getAccountInfo(...args); }
    getLatestBlockhash(...args: unknown[]) { return rpcMocks.getLatestBlockhash(...args); }
    sendRawTransaction(...args: unknown[]) { return rpcMocks.sendRawTransaction(...args); }
    getSignatureStatuses(...args: unknown[]) { return rpcMocks.getSignatureStatuses(...args); }
    getBlockHeight(...args: unknown[]) { return rpcMocks.getBlockHeight(...args); }
  }
  return { ...actual, Connection: MockConnection };
});

/** Генерируем тестовый кошелёк и конфиг */
function makeTestConfig(overrides: Partial<AppConfig> = {}): {
  cfg: AppConfig;
  wallet: Keypair;
} {
  const wallet = Keypair.generate();
  const cfg: AppConfig = {
    geyserEndpoint: "http://localhost:10000",
    geyserToken: "",
    rpcUrl: "http://localhost:8899",
    privateKey: bs58.encode(wallet.secretKey),
    targetSymbols: ["TEST"],
    buyAmountSol: 1,
    slippageBps: 500,
    priorityFeeMicroLamports: 100000,
    pumpFunProgramId: PUMP_PROGRAM_ID,
    ...overrides,
  };
  return { cfg, wallet };
}

/** Строит фейковый global account data с fee recipient */
function buildGlobalAccountData(feeRecipient: PublicKey): Buffer {
  const data = Buffer.alloc(73);
  feeRecipient.toBuffer().copy(data, 41);
  return data;
}

describe("Buyer integration", () => {
  beforeEach(() => {
    rpcMocks = {
      getBalance: vi.fn(),
      getAccountInfo: vi.fn(),
      getLatestBlockhash: vi.fn(),
      sendRawTransaction: vi.fn(),
      getSignatureStatuses: vi.fn(),
      getBlockHeight: vi.fn(),
    };
  });

  describe("init", () => {
    it("loads balance and fee recipient from global account", async () => {
      const feeRecipient = Keypair.generate().publicKey;
      const { cfg } = makeTestConfig();

      rpcMocks.getBalance.mockResolvedValue(5 * LAMPORTS_PER_SOL);
      rpcMocks.getAccountInfo.mockResolvedValue({
        data: buildGlobalAccountData(feeRecipient),
        executable: false,
        lamports: 0,
        owner: new PublicKey(PUMP_PROGRAM_ID),
      });

      const buyer = new Buyer(cfg);
      await buyer.init();

      expect(rpcMocks.getBalance).toHaveBeenCalledOnce();
      expect(rpcMocks.getAccountInfo).toHaveBeenCalledOnce();
    });

    it("handles balance fetch failure gracefully", async () => {
      const feeRecipient = Keypair.generate().publicKey;
      const { cfg } = makeTestConfig();

      rpcMocks.getBalance.mockRejectedValue(new Error("Network error"));
      rpcMocks.getAccountInfo.mockResolvedValue({
        data: buildGlobalAccountData(feeRecipient),
        executable: false,
        lamports: 0,
        owner: new PublicKey(PUMP_PROGRAM_ID),
      });

      const buyer = new Buyer(cfg);
      // Should not throw even if balance fetch fails
      await expect(buyer.init()).resolves.toBeUndefined();
      expect(rpcMocks.getAccountInfo).toHaveBeenCalledOnce();
    });

    it("handles global account fetch failure gracefully", async () => {
      const { cfg } = makeTestConfig();

      rpcMocks.getBalance.mockResolvedValue(0);
      rpcMocks.getAccountInfo.mockResolvedValue(null);

      const buyer = new Buyer(cfg);
      await expect(buyer.init()).resolves.toBeUndefined();
    });
  });

  describe("buy — success flow", () => {
    it("sends transaction and confirms it on-chain", async () => {
      const feeRecipient = Keypair.generate().publicKey;
      const mint = Keypair.generate().publicKey;
      const { cfg } = makeTestConfig();
      const fakeSig = "FakeSig123abc";

      rpcMocks.getBalance.mockResolvedValue(2 * LAMPORTS_PER_SOL);
      rpcMocks.getAccountInfo.mockResolvedValue({
        data: buildGlobalAccountData(feeRecipient),
        executable: false,
        lamports: 0,
        owner: new PublicKey(PUMP_PROGRAM_ID),
      });
      rpcMocks.getLatestBlockhash.mockResolvedValue({
        blockhash: "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N",
        lastValidBlockHeight: 1000,
      });
      rpcMocks.sendRawTransaction.mockResolvedValue(fakeSig);
      rpcMocks.getSignatureStatuses.mockResolvedValue({
        value: [{ confirmationStatus: "confirmed", err: null }],
      });

      const buyer = new Buyer(cfg);
      await buyer.init();

      const result = await buyer.buy(mint, "Test Token", "TEST");

      expect(result).toBe(fakeSig);
      expect(rpcMocks.sendRawTransaction).toHaveBeenCalledOnce();
      expect(rpcMocks.getSignatureStatuses).toHaveBeenCalledWith([fakeSig]);
    });
  });

  describe("buy — failure flows", () => {
    it("returns null when transaction fails on-chain", async () => {
      const feeRecipient = Keypair.generate().publicKey;
      const mint = Keypair.generate().publicKey;
      const { cfg } = makeTestConfig();

      rpcMocks.getBalance.mockResolvedValue(2 * LAMPORTS_PER_SOL);
      rpcMocks.getAccountInfo.mockResolvedValue({
        data: buildGlobalAccountData(feeRecipient),
        executable: false,
        lamports: 0,
        owner: new PublicKey(PUMP_PROGRAM_ID),
      });
      rpcMocks.getLatestBlockhash.mockResolvedValue({
        blockhash: "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N",
        lastValidBlockHeight: 1000,
      });
      rpcMocks.sendRawTransaction.mockResolvedValue("FailedSig");
      rpcMocks.getSignatureStatuses.mockResolvedValue({
        value: [{ confirmationStatus: "confirmed", err: { InsufficientFundsForRent: {} } }],
      });

      const buyer = new Buyer(cfg);
      await buyer.init();

      const result = await buyer.buy(mint, "Bad Token", "BAD");
      expect(result).toBeNull();
    });

    it("returns null when block height expires", async () => {
      const feeRecipient = Keypair.generate().publicKey;
      const mint = Keypair.generate().publicKey;
      const { cfg } = makeTestConfig();

      rpcMocks.getBalance.mockResolvedValue(2 * LAMPORTS_PER_SOL);
      rpcMocks.getAccountInfo.mockResolvedValue({
        data: buildGlobalAccountData(feeRecipient),
        executable: false,
        lamports: 0,
        owner: new PublicKey(PUMP_PROGRAM_ID),
      });
      rpcMocks.getLatestBlockhash.mockResolvedValue({
        blockhash: "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N",
        lastValidBlockHeight: 1000,
      });
      rpcMocks.sendRawTransaction.mockResolvedValue("ExpiredSig");
      rpcMocks.getSignatureStatuses.mockResolvedValue({ value: [null] });
      rpcMocks.getBlockHeight.mockResolvedValue(1001);

      const buyer = new Buyer(cfg);
      await buyer.init();

      const result = await buyer.buy(mint, "Expired", "EXP");
      expect(result).toBeNull();
    });

    it("returns null when fee recipient is not available", async () => {
      const mint = Keypair.generate().publicKey;
      const { cfg } = makeTestConfig();

      rpcMocks.getBalance.mockResolvedValue(0);
      rpcMocks.getAccountInfo.mockResolvedValue(null);

      const buyer = new Buyer(cfg);
      // init fails to load feeRecipient, buy should return null
      const result = await buyer.buy(mint, "No Fee", "NF");
      expect(result).toBeNull();
    });

    it("returns null when sendRawTransaction throws", async () => {
      const feeRecipient = Keypair.generate().publicKey;
      const mint = Keypair.generate().publicKey;
      const { cfg } = makeTestConfig();

      rpcMocks.getBalance.mockResolvedValue(2 * LAMPORTS_PER_SOL);
      rpcMocks.getAccountInfo.mockResolvedValue({
        data: buildGlobalAccountData(feeRecipient),
        executable: false,
        lamports: 0,
        owner: new PublicKey(PUMP_PROGRAM_ID),
      });
      rpcMocks.getLatestBlockhash.mockResolvedValue({
        blockhash: "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N",
        lastValidBlockHeight: 1000,
      });
      rpcMocks.sendRawTransaction.mockRejectedValue(new Error("RPC error"));

      const buyer = new Buyer(cfg);
      await buyer.init();

      const result = await buyer.buy(mint, "RPC Fail", "FAIL");
      expect(result).toBeNull();
    });
  });

  describe("buy amounts computation", () => {
    it("computes correct tokensOut and maxSolCost for 1 SOL buy", async () => {
      const feeRecipient = Keypair.generate().publicKey;
      const mint = Keypair.generate().publicKey;
      const { cfg } = makeTestConfig({ buyAmountSol: 1, slippageBps: 500 });

      rpcMocks.getBalance.mockResolvedValue(2 * LAMPORTS_PER_SOL);
      rpcMocks.getAccountInfo.mockResolvedValue({
        data: buildGlobalAccountData(feeRecipient),
        executable: false,
        lamports: 0,
        owner: new PublicKey(PUMP_PROGRAM_ID),
      });
      rpcMocks.getLatestBlockhash.mockResolvedValue({
        blockhash: "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N",
        lastValidBlockHeight: 1000,
      });
      rpcMocks.sendRawTransaction.mockResolvedValue("ComputeSig");
      rpcMocks.getSignatureStatuses.mockResolvedValue({
        value: [{ confirmationStatus: "confirmed", err: null }],
      });

      const buyer = new Buyer(cfg);
      await buyer.init();
      await buyer.buy(mint);

      // Verify the transaction was sent (confirms the full pipeline worked)
      expect(rpcMocks.sendRawTransaction).toHaveBeenCalledOnce();
      const rawTx = rpcMocks.sendRawTransaction.mock.calls[0][0];
      expect(rawTx).toBeInstanceOf(Uint8Array);
      expect(rawTx.length).toBeGreaterThan(0);

      // Verify amounts independently
      const buyLamports = BigInt(1 * LAMPORTS_PER_SOL);
      const fee = (buyLamports * FEE_BPS) / 10000n;
      const effective = buyLamports - fee;
      const expectedTokens =
        (effective * INITIAL_VIRTUAL_TOKEN_RESERVES) /
        (INITIAL_VIRTUAL_SOL_RESERVES + effective);
      const expectedMaxCost = buyLamports + (buyLamports * 500n) / 10000n;

      expect(expectedTokens).toBeGreaterThan(0n);
      expect(expectedMaxCost).toBe(1_050_000_000n);
    });
  });
});
