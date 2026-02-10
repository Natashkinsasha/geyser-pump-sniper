import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";

import type { AppConfig } from "../../config/index";
import { logger } from "../../lib/logger";
import { encodeBuyInstruction } from "./decoder";
import {
  LAMPORTS_PER_SOL,
  INITIAL_VIRTUAL_SOL_RESERVES,
  INITIAL_VIRTUAL_TOKEN_RESERVES,
  FEE_BPS,
} from "./constants";

export class Buyer {
  private connection: Connection;
  private wallet: Keypair;
  private feeRecipient: PublicKey | null = null;
  private pumpProgram: PublicKey;
  private globalPda: PublicKey;
  private eventAuthority: PublicKey;
  private cfg: AppConfig;

  constructor(cfg: AppConfig) {
    this.cfg = cfg;
    this.pumpProgram = new PublicKey(cfg.pumpFunProgramId);
    this.globalPda = PublicKey.findProgramAddressSync(
      [Buffer.from("global")],
      this.pumpProgram,
    )[0];
    this.eventAuthority = PublicKey.findProgramAddressSync(
      [Buffer.from("__event_authority")],
      this.pumpProgram,
    )[0];

    this.connection = new Connection(cfg.rpcUrl, "confirmed");
    this.wallet = Keypair.fromSecretKey(bs58.decode(cfg.privateKey));
    logger.info(
      { wallet: this.wallet.publicKey.toBase58() },
      "Buyer wallet loaded",
    );
  }

  async init(): Promise<void> {
    try {
      const globalInfo = await this.connection.getAccountInfo(this.globalPda);
      if (globalInfo && globalInfo.data.length >= 73) {
        this.feeRecipient = new PublicKey(globalInfo.data.subarray(41, 73));
        logger.info(
          { feeRecipient: this.feeRecipient.toBase58() },
          "Fee recipient loaded from global account",
        );
      } else {
        throw new Error("Global account data too short or not found");
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, "Failed to read global account");
    }
  }

  async buy(mint: PublicKey): Promise<string | null> {
    try {
      if (!this.feeRecipient) {
        await this.init();
        if (!this.feeRecipient) {
          throw new Error("Fee recipient not available");
        }
      }

      const buyAmountLamports = BigInt(
        Math.floor(this.cfg.buyAmountSol * LAMPORTS_PER_SOL),
      );
      const feeAmount = (buyAmountLamports * FEE_BPS) / 10000n;
      const effectiveSol = buyAmountLamports - feeAmount;

      const tokensOut =
        (effectiveSol * INITIAL_VIRTUAL_TOKEN_RESERVES) /
        (INITIAL_VIRTUAL_SOL_RESERVES + effectiveSol);

      const maxSolCost =
        buyAmountLamports +
        (buyAmountLamports * BigInt(this.cfg.slippageBps)) / 10000n;

      const [bondingCurve] = PublicKey.findProgramAddressSync(
        [Buffer.from("bonding-curve"), mint.toBuffer()],
        this.pumpProgram,
      );

      const associatedBondingCurve = getAssociatedTokenAddressSync(
        mint,
        bondingCurve,
        true,
      );

      const associatedUser = getAssociatedTokenAddressSync(
        mint,
        this.wallet.publicKey,
      );

      logger.info(
        {
          mint: mint.toBase58(),
          tokensOut: tokensOut.toString(),
          maxSolCost: `${(Number(maxSolCost) / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
          bondingCurve: bondingCurve.toBase58(),
        },
        "Building buy transaction",
      );

      const instructions: TransactionInstruction[] = [];

      instructions.push(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: this.cfg.priorityFeeMicroLamports,
        }),
      );
      instructions.push(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
      );

      instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          this.wallet.publicKey,
          associatedUser,
          this.wallet.publicKey,
          mint,
        ),
      );

      const buyData = encodeBuyInstruction(tokensOut, maxSolCost);
      instructions.push(
        new TransactionInstruction({
          programId: this.pumpProgram,
          keys: [
            { pubkey: this.globalPda, isSigner: false, isWritable: false },
            { pubkey: this.feeRecipient, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: bondingCurve, isSigner: false, isWritable: true },
            {
              pubkey: associatedBondingCurve,
              isSigner: false,
              isWritable: true,
            },
            { pubkey: associatedUser, isSigner: false, isWritable: true },
            { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
            {
              pubkey: SystemProgram.programId,
              isSigner: false,
              isWritable: false,
            },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
            { pubkey: this.eventAuthority, isSigner: false, isWritable: false },
            { pubkey: this.pumpProgram, isSigner: false, isWritable: false },
          ],
          data: buyData,
        }),
      );

      const { blockhash, lastValidBlockHeight } =
        await this.connection.getLatestBlockhash("confirmed");

      const messageV0 = new TransactionMessage({
        payerKey: this.wallet.publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);
      tx.sign([this.wallet]);

      const sig = await this.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      });

      logger.info({ sig, mint: mint.toBase58() }, "Buy transaction sent");

      this.connection
        .confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed",
        )
        .then(() => logger.info({ sig }, "Transaction confirmed"))
        .catch((err: any) =>
          logger.warn(
            { sig, err: err.message },
            "Confirmation timeout or error",
          ),
        );

      return sig;
    } catch (err: any) {
      logger.error(
        { err: err.message, mint: mint.toBase58() },
        "Buy failed",
      );
      return null;
    }
  }
}
