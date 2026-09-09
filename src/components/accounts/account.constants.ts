import {LabelValue} from "@/api/model/common.ts";
import type {AccountHeadType, NormalBalance} from "@/api/model/account.ts";
import type {TFunction} from "i18next";

export const HEAD_TYPE_VALUES: AccountHeadType[] = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
];

export const NORMAL_BALANCE_VALUES: NormalBalance[] = ["debit", "credit"];

export const getHeadTypeOptions = (t: TFunction): LabelValue[] =>
  HEAD_TYPE_VALUES.map((value) => ({
    label: t(`headTypes.${value}`),
    value,
  }));

export const getNormalBalanceOptions = (t: TFunction): LabelValue[] =>
  NORMAL_BALANCE_VALUES.map((value) => ({
    label: t(`normalBalance.${value}`),
    value,
  }));

/** @deprecated use getHeadTypeOptions */
export const HEAD_TYPE_OPTIONS: LabelValue[] = [
  {label: "Asset", value: "asset"},
  {label: "Liability", value: "liability"},
  {label: "Equity", value: "equity"},
  {label: "Income", value: "income"},
  {label: "Expense", value: "expense"},
];

/** @deprecated use HEAD_TYPE_OPTIONS / getHeadTypeOptions */
export const ACCOUNT_TYPE_OPTIONS = HEAD_TYPE_OPTIONS;

/** @deprecated use getNormalBalanceOptions */
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
