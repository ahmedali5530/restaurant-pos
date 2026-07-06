import {describe, expect, it} from "vitest";
import {classifyCashFlowBucket} from "@/components/accounts/reports.utils.ts";
import {isTrialBalanceBalanced} from "@/api/reports/accounts/shared.ts";
import {getAccountHeadType} from "@/components/accounts/reports.utils.ts";

describe("isTrialBalanceBalanced", () => {
  it("returns true when debits equal credits", () => {
    expect(isTrialBalanceBalanced(1000, 1000)).toBe(true);
  });

  it("returns false when debits differ from credits", () => {
    expect(isTrialBalanceBalanced(1000, 900)).toBe(false);
  });

  it("treats small rounding differences as balanced", () => {
    expect(isTrialBalanceBalanced(100.005, 100)).toBe(true);
  });
});

describe("classifyCashFlowBucket", () => {
  it("classifies purchase as Investing", () => {
    expect(classifyCashFlowBucket("purchase")).toBe("Investing");
  });

  it("classifies loan as Financing", () => {
    expect(classifyCashFlowBucket("loan")).toBe("Financing");
  });

  it("defaults to Operating", () => {
    expect(classifyCashFlowBucket("sales")).toBe("Operating");
  });
});

describe("getAccountHeadType for P&L split", () => {
  it("identifies income accounts", () => {
    expect(getAccountHeadType({group: {head_type: "income"}})).toBe("income");
  });

  it("identifies expense accounts", () => {
    expect(getAccountHeadType({group: {head_type: "expense"}})).toBe("expense");
  });
});
