import { TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { Client, PrivateKey } from "@x402/hedera";

/** One settled payment, as written to the audit trail. */
export interface PaymentRecord {
  /** ENS label of the service that was paid for. */
  readonly service: string;
  /** Units purchased, and what a unit is — the meter, preserved. */
  readonly units: number;
  readonly unit: string;
  /** Amount in the asset's smallest denomination, and the asset it is denominated in. */
  readonly amount: string;
  readonly asset: string;
  readonly payTo: string;
  readonly payer: string;
  /** Hedera transaction id of the settlement itself. */
  readonly transactionId: string;
}

export interface AuditLog {
  record(payment: PaymentRecord): Promise<void>;
}

/**
 * Writes each settled payment to a Hedera Consensus Service topic.
 *
 * @remarks
 * The point is that the trail is not ours to edit. A service that both takes the money and keeps
 * the only record of having taken it is asking to be trusted twice; HCS gives every entry a
 * consensus timestamp and an ordering that neither we nor the operator can revise afterwards, and
 * anyone can read the topic without our cooperation.
 *
 * Recording is **best-effort and never blocks the response**. The payment has already settled by
 * the time this runs — the money moved — so failing the request because the audit write failed
 * would take a service outage and turn it into a customer who paid and got nothing. Failures are
 * logged loudly instead; a gap in the trail is recoverable from the chain, an unfulfilled paid
 * request is not.
 */
export class HcsAuditLog implements AuditLog {
  private readonly client: Client;

  constructor(
    private readonly topicId: string,
    operatorId: string,
    operatorKey: string,
  ) {
    this.client = Client.forTestnet().setOperator(operatorId, PrivateKey.fromStringECDSA(operatorKey));
  }

  async record(payment: PaymentRecord): Promise<void> {
    const message = JSON.stringify({ v: 1, at: new Date().toISOString(), ...payment });
    await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(message)
      .execute(this.client);
  }

  close(): void {
    this.client.close();
  }
}

/** Discards entries. Used where a topic is not configured; never silently in production. */
export class NoopAuditLog implements AuditLog {
  async record(): Promise<void> {}
}
