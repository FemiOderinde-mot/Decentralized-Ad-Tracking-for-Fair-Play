import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, OptionalCV, principalCV, boolCV, ClarityType } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 300;
const ERR_INVALID_CAMPAIGN = 301;
const ERR_INVALID_PUBLISHER = 302;
const ERR_INVALID_USER = 303;
const ERR_CAMPAIGN_INACTIVE = 304;
const ERR_IMPRESSION_COOLDOWN = 305;
const ERR_INVALID_TIMESTAMP = 306;
const ERR_AUTHORITY_NOT_VERIFIED = 307;
const ERR_INVALID_IMPRESSION_LIMIT = 308;
const ERR_IMPRESSION_LIMIT_EXCEEDED = 309;
const ERR_INVALID_DEVICE_ID = 310;
const ERR_INVALID_LOCATION = 311;
const ERR_INVALID_REFERRER = 312;
const ERR_INVALID_CATEGORY = 313;
const ERR_INVALID_DURATION = 314;
const ERR_INVALID_STATUS = 315;
const ERR_INVALID_UPDATE_PARAM = 316;
const ERR_MAX_IMPRESSIONS_EXCEEDED = 317;
const ERR_INVALID_COOLDOWN = 318;
const ERR_INVALID_THRESHOLD = 319;
const ERR_INVALID_FEE = 320;

interface Impression {
  count: number;
  lastImpression: number;
  deviceId: string;
  location: string;
  referrer: string | null;
  category: string;
  duration: number;
  status: boolean;
}

interface ImpressionUpdate {
  updateTimestamp: number;
  updater: string;
  newStatus: boolean;
}

type Result<T> = { ok: true; value: T } | { ok: false; value: number };

interface CampaignDetails {
  active: boolean;
}

interface UserRole {
  role: string;
}

class ImpressionTrackerMock {
  state: {
    nextImpressionId: number;
    maxImpressionsPerCampaign: number;
    impressionCooldown: number;
    authorityContract: string | null;
    verificationFee: number;
    dailyLimitPerUser: number;
    globalImpressionCount: number;
    impressions: Map<string, Impression>;
    impressionsByCampaign: Map<number, number>;
    impressionsByUser: Map<string, number>;
    impressionsByPublisher: Map<string, number>;
    impressionUpdates: Map<number, ImpressionUpdate>;
  } = {
    nextImpressionId: 0,
    maxImpressionsPerCampaign: 1000000,
    impressionCooldown: 10,
    authorityContract: null,
    verificationFee: 100,
    dailyLimitPerUser: 100,
    globalImpressionCount: 0,
    impressions: new Map(),
    impressionsByCampaign: new Map(),
    impressionsByUser: new Map(),
    impressionsByPublisher: new Map(),
    impressionUpdates: new Map(),
  };
  blockHeight: number = 10;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];
  campaignDetails: Map<number, CampaignDetails> = new Map();
  userRoles: Map<string, UserRole> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextImpressionId: 0,
      maxImpressionsPerCampaign: 1000000,
      impressionCooldown: 10,
      authorityContract: null,
      verificationFee: 100,
      dailyLimitPerUser: 100,
      globalImpressionCount: 0,
      impressions: new Map(),
      impressionsByCampaign: new Map(),
      impressionsByUser: new Map(),
      impressionsByPublisher: new Map(),
      impressionUpdates: new Map(),
    };
    this.blockHeight = 10;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
    this.campaignDetails = new Map();
    this.userRoles = new Map();
  }

  getCampaignDetails(campaignId: number): CampaignDetails | null {
    return this.campaignDetails.get(campaignId) || null;
  }

  getUserRole(principal: string): UserRole | null {
    return this.userRoles.get(principal) || null;
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxImpressionsPerCampaign(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_IMPRESSION_LIMIT };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.maxImpressionsPerCampaign = newMax;
    return { ok: true, value: true };
  }

  setImpressionCooldown(newCooldown: number): Result<boolean> {
    if (newCooldown <= 0) return { ok: false, value: ERR_INVALID_COOLDOWN };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.impressionCooldown = newCooldown;
    return { ok: true, value: true };
  }

  setVerificationFee(newFee: number): Result<boolean> {
    if (newFee < 0) return { ok: false, value: ERR_INVALID_FEE };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.verificationFee = newFee;
    return { ok: true, value: true };
  }

  setDailyLimitPerUser(newLimit: number): Result<boolean> {
    if (newLimit <= 0) return { ok: false, value: ERR_INVALID_IMPRESSION_LIMIT };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.dailyLimitPerUser = newLimit;
    return { ok: true, value: true };
  }

  recordImpression(
    campaignId: number,
    publisher: string,
    deviceId: string,
    location: string,
    referrer: string | null,
    category: string,
    duration: number
  ): Result<number> {
    const user = this.caller;
    const key = `${campaignId}-${publisher}-${user}`;
    const campaign = this.getCampaignDetails(campaignId);
    if (!campaign) return { ok: false, value: ERR_INVALID_CAMPAIGN };
    if (!campaign.active) return { ok: false, value: ERR_CAMPAIGN_INACTIVE };
    const pubRole = this.getUserRole(publisher);
    if (!pubRole || pubRole.role !== "publisher") return { ok: false, value: ERR_INVALID_PUBLISHER };
    const userRole = this.getUserRole(user);
    if (!userRole || userRole.role !== "user") return { ok: false, value: ERR_INVALID_USER };
    if (deviceId.length === 0 || deviceId.length > 64) return { ok: false, value: ERR_INVALID_DEVICE_ID };
    if (location.length === 0 || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (category.length === 0 || category.length > 50) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (duration <= 0) return { ok: false, value: ERR_INVALID_DURATION };
    const current = this.state.impressions.get(key) || {
      count: 0,
      lastImpression: 0,
      deviceId: "",
      location: "",
      referrer: null,
      category: "",
      duration: 0,
      status: true,
    };
    if (this.blockHeight < current.lastImpression + this.state.impressionCooldown) {
      return { ok: false, value: ERR_IMPRESSION_COOLDOWN };
    }
    const currentUserCount = this.state.impressionsByUser.get(user) || 0;
    if (currentUserCount >= this.state.dailyLimitPerUser) {
      return { ok: false, value: ERR_IMPRESSION_LIMIT_EXCEEDED };
    }
    const currentCampaignCount = this.state.impressionsByCampaign.get(campaignId) || 0;
    if (currentCampaignCount >= this.state.maxImpressionsPerCampaign) {
      return { ok: false, value: ERR_IMPRESSION_LIMIT_EXCEEDED };
    }
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.stxTransfers.push({ amount: this.state.verificationFee, from: this.caller, to: this.state.authorityContract });
    const updated: Impression = {
      count: current.count + 1,
      lastImpression: this.blockHeight,
      deviceId,
      location,
      referrer,
      category,
      duration,
      status: true,
    };
    this.state.impressions.set(key, updated);
    this.state.impressionsByCampaign.set(campaignId, currentCampaignCount + 1);
    this.state.impressionsByUser.set(user, currentUserCount + 1);
    const currentPublisherCount = this.state.impressionsByPublisher.get(publisher) || 0;
    this.state.impressionsByPublisher.set(publisher, currentPublisherCount + 1);
    const id = this.state.nextImpressionId;
    this.state.nextImpressionId++;
    this.state.globalImpressionCount++;
    return { ok: true, value: id };
  }

  updateImpressionStatus(
    campaignId: number,
    publisher: string,
    user: string,
    newStatus: boolean,
    impressionId: number
  ): Result<boolean> {
    const key = `${campaignId}-${publisher}-${user}`;
    const impression = this.state.impressions.get(key);
    if (!impression) return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
    const callerRole = this.getUserRole(this.caller);
    if (!callerRole || callerRole.role !== "advertiser") return { ok: false, value: ERR_NOT_AUTHORIZED };
    const updated: Impression = { ...impression, status: newStatus };
    this.state.impressions.set(key, updated);
    this.state.impressionUpdates.set(impressionId, {
      updateTimestamp: this.blockHeight,
      updater: this.caller,
      newStatus,
    });
    return { ok: true, value: true };
  }

  getGlobalImpressionCount(): Result<number> {
    return { ok: true, value: this.state.globalImpressionCount };
  }

  getNextImpressionId(): Result<number> {
    return { ok: true, value: this.state.nextImpressionId };
  }
}

describe("ImpressionTracker", () => {
  let contract: ImpressionTrackerMock;

  beforeEach(() => {
    contract = new ImpressionTrackerMock();
    contract.reset();
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(true);
    }
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toBe(ERR_NOT_AUTHORIZED);
    }
  });

  it("sets max impressions per campaign successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setMaxImpressionsPerCampaign(2000000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(true);
    }
    expect(contract.state.maxImpressionsPerCampaign).toBe(2000000);
  });

  it("rejects max impressions change without authority", () => {
    const result = contract.setMaxImpressionsPerCampaign(2000000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
    }
  });

  it("sets impression cooldown successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setImpressionCooldown(20);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(true);
    }
    expect(contract.state.impressionCooldown).toBe(20);
  });

  it("rejects invalid cooldown", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setImpressionCooldown(0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toBe(ERR_INVALID_COOLDOWN);
    }
  });

  it("sets verification fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setVerificationFee(200);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(true);
    }
    expect(contract.state.verificationFee).toBe(200);
  });

  it("rejects invalid fee", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setVerificationFee(-1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toBe(ERR_INVALID_FEE);
    }
  });

  it("sets daily limit per user successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setDailyLimitPerUser(200);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(true);
    }
    expect(contract.state.dailyLimitPerUser).toBe(200);
  });

  it("rejects invalid daily limit", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setDailyLimitPerUser(0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toBe(ERR_INVALID_IMPRESSION_LIMIT);
    }
  });

  it("records impression successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.campaignDetails.set(1, { active: true });
    contract.userRoles.set("STPUB", { role: "publisher" });
    contract.userRoles.set("ST1TEST", { role: "user" });
    const result = contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
    expect(contract.state.globalImpressionCount).toBe(1);
    expect(contract.stxTransfers).toEqual([{ amount: 100, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects impression without authority", () => {
    contract.campaignDetails.set(1, { active: true });
    contract.userRoles.set("STPUB", { role: "publisher" });
    contract.userRoles.set("ST1TEST", { role: "user" });
    const result = contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
    }
  });

  it("rejects invalid campaign", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toBe(ERR_INVALID_CAMPAIGN);
    }
  });

  it("rejects inactive campaign", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.campaignDetails.set(1, { active: false });
    contract.userRoles.set("STPUB", { role: "publisher" });
    contract.userRoles.set("ST1TEST", { role: "user" });
    const result = contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toBe(ERR_CAMPAIGN_INACTIVE);
    }
  });

  it("rejects invalid publisher", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.campaignDetails.set(1, { active: true });
    contract.userRoles.set("ST1TEST", { role: "user" });
    const result = contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toBe(ERR_INVALID_PUBLISHER);
    }
  });

  it("rejects invalid user", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.campaignDetails.set(1, { active: true });
    contract.userRoles.set("STPUB", { role: "publisher" });
    const result = contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toBe(ERR_INVALID_USER);
    }
  });

  it("rejects impression during cooldown", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.campaignDetails.set(1, { active: true });
    contract.userRoles.set("STPUB", { role: "publisher" });
    contract.userRoles.set("ST1TEST", { role: "user" });
    contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    contract.blockHeight += 5;
    const result = contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toBe(ERR_IMPRESSION_COOLDOWN);
    }
  });

  it("rejects when daily limit exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.campaignDetails.set(1, { active: true });
    contract.userRoles.set("STPUB", { role: "publisher" });
    contract.userRoles.set("ST1TEST", { role: "user" });
    contract.state.dailyLimitPerUser = 1;
    contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    contract.blockHeight += 20;
    const result = contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toBe(ERR_IMPRESSION_LIMIT_EXCEEDED);
    }
  });

  it("rejects when max per campaign exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.campaignDetails.set(1, { active: true });
    contract.userRoles.set("STPUB", { role: "publisher" });
    contract.userRoles.set("ST1TEST", { role: "user" });
    contract.state.maxImpressionsPerCampaign = 1;
    contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    contract.blockHeight += 20;
    contract.caller = "ST2USER";
    contract.userRoles.set("ST2USER", { role: "user" });
    const result = contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toBe(ERR_IMPRESSION_LIMIT_EXCEEDED);
    }
  });

  it("updates impression status successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.campaignDetails.set(1, { active: true });
    contract.userRoles.set("STPUB", { role: "publisher" });
    contract.userRoles.set("ST1TEST", { role: "user" });
    contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    contract.caller = "STADV";
    contract.userRoles.set("STADV", { role: "advertiser" });
    const result = contract.updateImpressionStatus(1, "STPUB", "ST1TEST", false, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(true);
    }
    const update = contract.state.impressionUpdates.get(0);
    expect(update?.newStatus).toBe(false);
  });

  it("rejects update by non-advertiser", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.campaignDetails.set(1, { active: true });
    contract.userRoles.set("STPUB", { role: "publisher" });
    contract.userRoles.set("ST1TEST", { role: "user" });
    contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    const result = contract.updateImpressionStatus(1, "STPUB", "ST1TEST", false, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toBe(ERR_NOT_AUTHORIZED);
    }
  });

  it("rejects update for non-existent impression", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.userRoles.set("STADV", { role: "advertiser" });
    contract.caller = "STADV";
    const result = contract.updateImpressionStatus(1, "STPUB", "ST1TEST", false, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toBe(ERR_INVALID_UPDATE_PARAM);
    }
  });

  it("gets global impression count correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.campaignDetails.set(1, { active: true });
    contract.userRoles.set("STPUB", { role: "publisher" });
    contract.userRoles.set("ST1TEST", { role: "user" });
    contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    const result = contract.getGlobalImpressionCount();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(1);
    }
  });

  it("gets next impression id correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.campaignDetails.set(1, { active: true });
    contract.userRoles.set("STPUB", { role: "publisher" });
    contract.userRoles.set("ST1TEST", { role: "user" });
    contract.recordImpression(
      1,
      "STPUB",
      "device123",
      "locationX",
      null,
      "categoryY",
      30
    );
    const result = contract.getNextImpressionId();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(1);
    }
  });
});