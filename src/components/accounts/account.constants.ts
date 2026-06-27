import {LabelValue} from "@/api/model/common.ts";
import type {AccountHeadType, NormalBalance} from "@/api/model/account.ts";

export const HEAD_TYPE_OPTIONS: LabelValue[] = [
  {label: "Asset", value: "asset"},
  {label: "Liability", value: "liability"},
  {label: "Equity", value: "equity"},
  {label: "Income", value: "income"},
  {label: "Expense", value: "expense"},
];

/** @deprecated use HEAD_TYPE_OPTIONS */
export const ACCOUNT_TYPE_OPTIONS = HEAD_TYPE_OPTIONS;

export const NORMAL_BALANCE_OPTIONS: LabelValue[] = [
  {label: "Debit", value: "debit"},
  {label: "Credit", value: "credit"},
];

export const defaultNormalBalanceForHead = (headType: AccountHeadType): NormalBalance => {
  if (headType === "asset" || headType === "expense") {
    return "debit";
  }
  return "credit";
};

export const formatMoney = (value: number) => {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
};
