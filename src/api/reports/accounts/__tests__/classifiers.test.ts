import {describe, expect, it} from "vitest";
import {classifyCashFlowBucket, isCashGroupAccount} from "@/components/accounts/reports.utils.ts";
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
  it("classifies purchase as investing", () => {
    expect(classifyCashFlowBucket("purchase")).toBe("investing");
  });

  it("classifies inventory-core as investing", () => {
    expect(classifyCashFlowBucket("inventory-core")).toBe("investing");
  });

  it("classifies loan as financing", () => {
    expect(classifyCashFlowBucket("loan")).toBe("financing");
  });

  it("classifies pos-core as operating", () => {
    expect(classifyCashFlowBucket("pos-core")).toBe("operating");
  });

  it("classifies hr-core as operating", () => {
    expect(classifyCashFlowBucket("hr-core")).toBe("operating");
  });

  it("defaults unclassified to operating", () => {
    expect(classifyCashFlowBucket("unclassified")).toBe("operating");
    expect(classifyCashFlowBucket("")).toBe("operating");
  });
});

describe("getAccountHeadType for P&L split", () => {
  it("identifies income accounts", () => {
    expect(getAccountHeadType({group: {head_type: "income"}})).toBe("income");
  });

  it("identifies expense accounts", () => {
    expect(getAccountHeadType({group: {head_type: "expense"}})).toBe("expense");
  });

  it("falls back to flattened group when nested group is missing", () => {
    expect(getAccountHeadType({account_type: undefined}, {head_type: "income"})).toBe("income");
  });

  it("falls back to account_type", () => {
    expect(getAccountHeadType({account_type: "expense"})).toBe("expense");
  });
});

describe("isCashGroupAccount for cash flow lines", () => {
  it("accepts nested account shapes from SELECT account", () => {
    expect(isCashGroupAccount({
      code: "CASH_MAIN",
      name: "Main Cash",
      group: {code: "CASH", name: "Cash"},
    })).toBe(true);
  });

  it("accepts accounts named Cash or Bank", () => {
    expect(isCashGroupAccount({code: "1001", name: "Cash"})).toBe(true);
    expect(isCashGroupAccount({code: "1002", name: "Bank"})).toBe(true);
  });

  it("rejects missing account", () => {
    expect(isCashGroupAccount(undefined)).toBe(false);
  });

  it("rejects non-cash accounts even when code starts with 10", () => {
    expect(isCashGroupAccount({
      code: "1003",
      name: "Sale",
      group: {code: "INC", name: "Income"},
    })).toBe(false);
  });
});
