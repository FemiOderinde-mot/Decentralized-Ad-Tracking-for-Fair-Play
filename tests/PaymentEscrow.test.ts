import { describe, it, expect, beforeEach } from "vitest";
import { uintCV } from "@stacks/transactions";

const ERR_INSUFFICIENT_ESCROW = 504;
const ERR_ESCROW_NOT_FOUND = 503;
const ERR_INVALID_DISPUTE_ID = 516;
const ERR_INSUFFICIENT_VOTES = 518;
const ERR_NOT_PUBLISHER = 509;

interface Escrow {
  campaignId: number;
  amount: number;
  released: number;
  advertiser: string;
  createdAt: number;
  active: boolean;
  disputeId: number | null;
}

interface Dispute {
  campaignId: number;
  disputant: string;
  votesYes: number;
  votesNo: number;
  resolved: boolean;
  resolution: boolean;
}

interface PublisherMetrics {
  impressions: number;
  clicks: number;
  lastClaim: number;
}

interface Refund {
  campaignId: number;
  amount: number;
  refundedTo: string;
  timestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class PaymentEscrowMock {
  state: {
    owner: string;
    impressionValue: number;
    clickValue: number;
    minBudget: number;
    escrowTimeout: number;
    paused: boolean;
    totalEscrows: number;
    escrows: Map<number, Escrow>;
    disputes: Map<number, Dispute>;
    publishers: Map<string, PublisherMetrics>;
    refunds: Map<number, Refund>;
    stxTransfers: Array<{ amount: number; from: string; to: string }>;
  } = {
    owner: "ST1OWNER",
    impressionValue: 1,
    clickValue: 5,
    minBudget: 1000,
    escrowTimeout: 100,
    paused: false,
    totalEscrows: 0,
    escrows: new Map(),
    disputes: new Map(),
    publishers: new Map(),
    refunds: new Map(),
    stxTransfers: [],
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  mockCampaignDetails: Map<number, { advertiser: string; active: boolean }> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      owner: "ST1OWNER",
      impressionValue: 1,
      clickValue: 5,
      minBudget: 1000,
      escrowTimeout: 100,
      paused: false,
      totalEscrows: 0,
      escrows: new Map(),
      disputes: new Map(),
      publishers: new Map(),
      refunds: new Map(),
      stxTransfers: [],
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.mockCampaignDetails = new Map();
  }

  setMockCampaignDetails(campaignId: number, advertiser: string, active: boolean): void {
    this.mockCampaignDetails.set(campaignId, { advertiser, active });
  }

  getMockCampaignDetails(campaignId: number): { advertiser: string; active: boolean } | null {
    return this.mockCampaignDetails.get(campaignId) || null;
  }

  getMockImpressions(campaignId: number, publisher: string): { count: number } {
    return { count: 10 };
  }

  getMockClicks(campaignId: number, publisher: string): { count: number } {
    return { count: 2 };
  }

  fundEscrow(campaignId: number, amount: number): Result<boolean> {
    if (this.state.paused) return { ok: false, value: 510 };
    if (campaignId <= 0) return { ok: false, value: 500 };
    if (amount < this.state.minBudget) return { ok: false, value: 502 };
    const campaignDetails = this.getMockCampaignDetails(campaignId);
    if (!campaignDetails) return { ok: false, value: 505 };
    if (this.caller !== campaignDetails.advertiser) return { ok: false, value: 501 };
    this.state.stxTransfers.push({ amount, from: this.caller, to: "contract" });
    const escrow: Escrow = {
      campaignId,
      amount,
      released: 0,
      advertiser: this.caller,
      createdAt: this.blockHeight,
      active: true,
      disputeId: null,
    };
    this.state.escrows.set(campaignId, escrow);
    this.state.totalEscrows++;
    return { ok: true, value: true };
  }

  releasePayment(campaignId: number, publisher: string): Result<number> {
    if (this.state.paused) return { ok: false, value: 510 };
    const escrow = this.state.escrows.get(campaignId);
    if (!escrow) return { ok: false, value: ERR_ESCROW_NOT_FOUND };
    const campaignDetails = this.getMockCampaignDetails(campaignId);
    if (!campaignDetails || !campaignDetails.active) return { ok: false, value: 505 };
    if (!publisher) return { ok: false, value: 506 };
    if (escrow.disputeId !== null) return { ok: false, value: 515 };
    const impressions = this.getMockImpressions(campaignId, publisher).count;
    const clicks = this.getMockClicks(campaignId, publisher).count;
    const payout = impressions * this.state.impressionValue + clicks * this.state.clickValue;
    if (payout > escrow.amount - escrow.released) return { ok: false, value: ERR_INSUFFICIENT_ESCROW };
    this.state.stxTransfers.push({ amount: payout, from: "contract", to: publisher });
    const updatedEscrow: Escrow = { ...escrow, released: escrow.released + payout };
    this.state.escrows.set(campaignId, updatedEscrow);
    const key = `${campaignId}-${publisher}`;
    this.state.publishers.set(key, { impressions, clicks, lastClaim: this.blockHeight });
    return { ok: true, value: payout };
  }

  refundEscrow(campaignId: number, refundAmount: number): Result<boolean> {
    if (this.state.paused) return { ok: false, value: false };
    const escrow = this.state.escrows.get(campaignId);
    if (!escrow) return { ok: false, value: false };
    if (this.caller !== escrow.advertiser) return { ok: false, value: false };
    if (refundAmount <= 0 || refundAmount > escrow.amount - escrow.released) return { ok: false, value: 508 };
    this.state.stxTransfers.push({ amount: refundAmount, from: "contract", to: this.caller });
    const updatedEscrow: Escrow = { ...escrow, amount: escrow.amount - refundAmount };
    this.state.escrows.set(campaignId, updatedEscrow);
    this.state.refunds.set(campaignId, { campaignId, amount: refundAmount, refundedTo: this.caller, timestamp: this.blockHeight });
    return { ok: true, value: true };
  }

  fileDispute(campaignId: number): Result<number> {
    if (this.state.paused) return { ok: false, value: 0 };
    const escrow = this.state.escrows.get(campaignId);
    if (!escrow) return { ok: false, value: ERR_ESCROW_NOT_FOUND };
    const disputeId = this.state.totalEscrows;
    const dispute: Dispute = {
      campaignId,
      disputant: this.caller,
      votesYes: 0,
      votesNo: 0,
      resolved: false,
      resolution: false,
    };
    this.state.disputes.set(disputeId, dispute);
    const updatedEscrow: Escrow = { ...escrow, disputeId, active: false };
    this.state.escrows.set(campaignId, updatedEscrow);
    return { ok: true, value: disputeId };
  }

  voteOnDispute(disputeId: number, voteYes: boolean): Result<boolean> {
    if (this.state.paused) return { ok: false, value: false };
    const dispute = this.state.disputes.get(disputeId);
    if (!dispute) return { ok: false, value: ERR_INVALID_DISPUTE_ID };
    if (dispute.resolved) return { ok: false, value: 519 };
    if (voteYes) {
      const updated: Dispute = { ...dispute, votesYes: dispute.votesYes + 1 };
      this.state.disputes.set(disputeId, updated);
    } else {
      const updated: Dispute = { ...dispute, votesNo: dispute.votesNo + 1 };
      this.state.disputes.set(disputeId, updated);
    }
    return { ok: true, value: true };
  }

  resolveDispute(disputeId: number): Result<boolean> {
    if (this.state.paused) return { ok: false, value: false };
    const dispute = this.state.disputes.get(disputeId);
    if (!dispute) return { ok: false, value: ERR_INVALID_DISPUTE_ID };
    if (this.caller !== dispute.disputant) return { ok: false, value: ERR_NOT_PUBLISHER };
    if (dispute.resolved) return { ok: false, value: 519 };
    const threshold = 3;
    if (dispute.votesYes <= dispute.votesNo + threshold) return { ok: false, value: ERR_INSUFFICIENT_VOTES };
    const resolution = true;
    const updatedDispute: Dispute = { ...dispute, resolved: true, resolution };
    this.state.disputes.set(disputeId, updatedDispute);
    const escrow = this.state.escrows.get(dispute.campaignId);
    if (escrow) {
      const updatedEscrow: Escrow = { ...escrow, disputeId: null, active: true };
      this.state.escrows.set(dispute.campaignId, updatedEscrow);
    }
    return { ok: true, value: resolution };
  }

  getEscrow(campaignId: number): Escrow | null {
    return this.state.escrows.get(campaignId) || null;
  }

  getDispute(disputeId: number): Dispute | null {
    return this.state.disputes.get(disputeId) || null;
  }

  getPublisherMetrics(campaignId: number, publisher: string): PublisherMetrics | null {
    const key = `${campaignId}-${publisher}`;
    return this.state.publishers.get(key) || null;
  }

  getRefund(campaignId: number): Refund | null {
    return this.state.refunds.get(campaignId) || null;
  }

  isPaused(): boolean {
    return this.state.paused;
  }
}

describe("PaymentEscrow", () => {
  let contract: PaymentEscrowMock;

  beforeEach(() => {
    contract = new PaymentEscrowMock();
    contract.reset();
    contract.setMockCampaignDetails(1, "ST1TEST", true);
  });

  it("funds escrow successfully", () => {
    const result = contract.fundEscrow(1, 2000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const escrow = contract.getEscrow(1);
    expect(escrow?.amount).toBe(2000);
    expect(escrow?.released).toBe(0);
    expect(escrow?.advertiser).toBe("ST1TEST");
    expect(contract.state.stxTransfers).toEqual([{ amount: 2000, from: "ST1TEST", to: "contract" }]);
  });

  it("rejects funding with insufficient amount", () => {
    const result = contract.fundEscrow(1, 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(502);
  });

  it("rejects funding invalid campaign", () => {
    const result = contract.fundEscrow(0, 2000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(500);
  });

  it("rejects funding by non-advertiser", () => {
    contract.caller = "ST2FAKE";
    const result = contract.fundEscrow(1, 2000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(501);
  });

  it("releases payment successfully", () => {
    contract.fundEscrow(1, 2000);
    contract.caller = "ST1PUBLISHER";
    const result = contract.releasePayment(1, "ST1PUBLISHER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(20);
    const escrow = contract.getEscrow(1);
    expect(escrow?.released).toBe(20);
    const metrics = contract.getPublisherMetrics(1, "ST1PUBLISHER");
    expect(metrics?.impressions).toBe(10);
    expect(metrics?.clicks).toBe(2);
    expect(contract.state.stxTransfers).toEqual([
      { amount: 2000, from: "ST1TEST", to: "contract" },
      { amount: 20, from: "contract", to: "ST1PUBLISHER" }
    ]);
  });

  it("rejects release during dispute", () => {
    contract.fundEscrow(1, 2000);
    contract.caller = "ST1DISPUTANT";
    contract.fileDispute(1);
    contract.caller = "ST1PUBLISHER";
    const result = contract.releasePayment(1, "ST1PUBLISHER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(515);
  });

  it("refunds escrow successfully", () => {
    contract.fundEscrow(1, 2000);
    const result = contract.refundEscrow(1, 500);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const escrow = contract.getEscrow(1);
    expect(escrow?.amount).toBe(1500);
    const refund = contract.getRefund(1);
    expect(refund?.amount).toBe(500);
    expect(contract.state.stxTransfers).toEqual([
      { amount: 2000, from: "ST1TEST", to: "contract" },
      { amount: 500, from: "contract", to: "ST1TEST" }
    ]);
  });

  it("rejects refund by non-advertiser", () => {
    contract.fundEscrow(1, 2000);
    contract.caller = "ST2FAKE";
    const result = contract.refundEscrow(1, 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects invalid refund amount", () => {
    contract.fundEscrow(1, 2000);
    const result = contract.refundEscrow(1, 3000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(508);
  });

  it("files dispute successfully", () => {
    contract.fundEscrow(1, 2000);
    contract.caller = "ST1DISPUTANT";
    const result = contract.fileDispute(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const escrow = contract.getEscrow(1);
    expect(escrow?.disputeId).toBe(1);
    expect(escrow?.active).toBe(false);
    const dispute = contract.getDispute(1);
    expect(dispute?.disputant).toBe("ST1DISPUTANT");
  });

  it("votes on dispute successfully", () => {
    contract.fundEscrow(1, 2000);
    contract.caller = "ST1DISPUTANT";
    contract.fileDispute(1);
    const voteResult = contract.voteOnDispute(1, true);
    expect(voteResult.ok).toBe(true);
    expect(voteResult.value).toBe(true);
    const dispute = contract.getDispute(1);
    expect(dispute?.votesYes).toBe(1);
  });

  it("resolves dispute successfully", () => {
    contract.fundEscrow(1, 2000);
    contract.caller = "ST1DISPUTANT";
    contract.fileDispute(1);
    contract.voteOnDispute(1, true);
    contract.voteOnDispute(1, true);
    contract.voteOnDispute(1, true);
    contract.voteOnDispute(1, true);
    const result = contract.resolveDispute(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const dispute = contract.getDispute(1);
    expect(dispute?.resolved).toBe(true);
    expect(dispute?.resolution).toBe(true);
    const escrow = contract.getEscrow(1);
    expect(escrow?.disputeId).toBeNull();
    expect(escrow?.active).toBe(true);
  });

  it("rejects resolve with insufficient votes", () => {
    contract.fundEscrow(1, 2000);
    contract.caller = "ST1DISPUTANT";
    contract.fileDispute(1);
    const result = contract.resolveDispute(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_VOTES);
  });

  it("rejects resolve by non-disputant", () => {
    contract.fundEscrow(1, 2000);
    contract.caller = "ST1DISPUTANT";
    contract.fileDispute(1);
    contract.caller = "ST2FAKE";
    const result = contract.resolveDispute(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_PUBLISHER);
  });

  it("parses Clarity types correctly", () => {
    const campaignId = uintCV(1);
    const amount = uintCV(2000);
    expect(campaignId.value.toString()).toBe("1");
    expect(amount.value.toString()).toBe("2000");
  });
});