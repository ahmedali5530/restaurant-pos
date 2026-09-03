import {Tables} from "@/api/db/tables.ts";
import type {DbClient} from "@/api/reports/shared/types.ts";
import type {AccountHeadType} from "@/api/model/account.ts";
import {
  getAccountHeadType,
  isCustomerAccount,
  isSupplierAccount,
} from "@/components/accounts/reports.utils.ts";

export interface AccountListItem {
  id?: string;
  code: string;
  name: string;
  headType?: AccountHeadType;
  isActive: boolean;
}

export interface ListAccountsResult {
  accounts: AccountListItem[];
}

export const listAccounts = async (
  db: DbClient,
  filters: {
    headType?: AccountHeadType;
    activeOnly?: boolean;
    customerOnly?: boolean;
    supplierOnly?: boolean;
    search?: string;
  } = {},
): Promise<ListAccountsResult> => {
  const where: string[] = [];
  const parameters: Record<string, unknown> = {};

  if (filters.activeOnly !== false) {
    where.push("is_active = true");
  }

  if (filters.search?.trim()) {
    where.push("(string::contains(string::lowercase(code), string::lowercase($search)) OR string::contains(string::lowercase(name), string::lowercase($search)))");
    parameters.search = filters.search.trim();
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await db.query(
    `
      SELECT *
      FROM ${Tables.accounts}
      ${whereClause}
      ORDER BY code ASC
      FETCH group
    `,
    parameters,
  );

  let accounts: AccountListItem[] = (rows || []).map((account: {
    id?: {toString(): string};
    code?: string;
    name?: string;
    is_active?: boolean;
    group?: {head_type?: string};
  }) => ({
    id: account.id?.toString(),
    code: String(account.code || ""),
    name: String(account.name || ""),
    headType: getAccountHeadType(account),
    isActive: account.is_active !== false,
  }));

  if (filters.headType) {
    accounts = accounts.filter((account) => account.headType === filters.headType);
  }

  if (filters.customerOnly) {
    accounts = accounts.filter((account) =>
      isCustomerAccount({code: account.code, name: account.name}),
    );
  }

  if (filters.supplierOnly) {
    accounts = accounts.filter((account) =>
      isSupplierAccount({code: account.code, name: account.name}),
    );
  }

  return {accounts};
};
