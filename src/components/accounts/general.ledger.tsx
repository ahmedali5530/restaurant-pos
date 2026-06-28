import {useEffect, useMemo, useState} from "react";
import {DateTime} from "luxon";
import {Controller, useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Loader} from "@/components/common/loader/loader.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {toRecordId} from "@/lib/utils.ts";
import {formatMoney} from "@/components/accounts/account.constants.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Account} from "@/api/model/account.ts";
import {toQueryDateTime} from "@/components/accounts/reports.utils.ts";

interface LedgerRow {
  account: {
    id?: string;
    code: string;
    name: string;
  };
  total_debit: number;
  total_credit: number;
  balance: number;
  opening_balance: number;
}

export const GeneralLedger = () => {
  const {t} = useTranslation('accounts');
  const db = useDB();
  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const {control, watch} = useForm({
    defaultValues: {
      account: null as {label: string; value: string} | null,
    }
  });
  const selectedAccount = watch("account");
  const [filters, setFilters] = useState({
    date_from: DateTime.now().startOf("month").toFormat("yyyy-MM-dd'T'HH:mm"),
    date_to: DateTime.now().endOf("month").toFormat("yyyy-MM-dd'T'HH:mm"),
  });
  const accountHook = useApi<SettingsData<Account>>(
    Tables.accounts,
    [`is_active = true`],
    ["account.code ASC"],
    0,
    9999
  );

  const accountOptions = useMemo(() => {
    return (accountHook.data?.data || []).map((item) => ({
      label: `${item.code} - ${item.name}`,
      value: item.id.toString(),
    }));
  }, [accountHook.data?.data]);

  const loadLedger = async (event?: any) => {
    event?.preventDefault?.();

    setIsLoading(true);
    try {
      const startDate = filters.date_from
        ? toQueryDateTime(filters.date_from)
        : toQueryDateTime(DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm"));

      const periodWhere: string[] = [];
      const openingWhere: string[] = ["entry.date < <datetime>$start_date"];
      const parameters: Record<string, any> = {start_date: startDate};

      if (filters.date_from) {
        periodWhere.push("entry.date >= <datetime>$date_from");
        parameters.date_from = toQueryDateTime(filters.date_from);
      }

      if (filters.date_to) {
        periodWhere.push("entry.date <= <datetime>$date_to");
        parameters.date_to = toQueryDateTime(filters.date_to);
      }

      if (selectedAccount?.value) {
        periodWhere.push("account = $account");
        openingWhere.push("account = $account");
        parameters.account = toRecordId(selectedAccount.value);
      }

      const whereClause = (clauses: string[]) => (clauses.length ? clauses.join(" AND ") : "true");

      const openingQuery = `
          SELECT account, account.id, math::sum(debit - credit) AS balance
          FROM ${Tables.account_journal_lines}
          WHERE ${whereClause(openingWhere)}
          GROUP BY account
          FETCH account
      `;

      const periodQuery = `
          SELECT
            account,
            account.id,
            account.code,
            account.name,
            math::sum(debit) AS total_debit,
            math::sum(credit) AS total_credit,
            math::sum(debit - credit) AS balance
          FROM ${Tables.account_journal_lines}
          WHERE ${whereClause(periodWhere)}
          GROUP BY account.id, account.code, account.name
          ORDER BY account.code ASC
          FETCH account, account.group
      `;

      const [[openingRows], [periodRows]] = await Promise.all([
        db.query(openingQuery, parameters),
        db.query(periodQuery, parameters),
      ]);

      const openingByAccount = new Map<string, number>();
      (openingRows || []).forEach((row: {account?: any; balance?: number}) => {
        const accountId = row.account?.id?.toString() || (row.account && typeof row.account === 'string' ? row.account : row.account?.toString());
        if (!accountId || accountId === '[object Object]') {
          return;
        }
        openingByAccount.set(accountId, Number(row.balance || 0));
      });

      const periodByAccount = new Map<string, LedgerRow>();
      (periodRows || []).forEach((row: LedgerRow & {account?: any}) => {
        const accountId = row.account?.id?.toString() || (row.account && typeof row.account === 'string' ? row.account : row.account?.toString());
        if (!accountId || accountId === '[object Object]') {
          return;
        }
        periodByAccount.set(accountId, {
          account: row.account,
          total_debit: Number(row.total_debit || 0),
          total_credit: Number(row.total_credit || 0),
          balance: Number(row.balance || 0),
          opening_balance: openingByAccount.get(accountId) ?? 0,
        });
        openingByAccount.delete(accountId);
      });

      const openingOnlyRows: LedgerRow[] = (openingRows || [])
        .filter((row: {account?: any}) => {
          const accountId = row.account?.id?.toString() || (row.account && typeof row.account === 'string' ? row.account : row.account?.toString());
          if (!accountId || accountId === '[object Object]') {
            return false;
          }
          return openingByAccount.has(accountId);
        })
        .map((row: {account: LedgerRow["account"]; balance?: number}) => ({
          account: row.account,
          total_debit: 0,
          total_credit: 0,
          balance: 0,
          opening_balance: Number(row.balance || 0),
        }));

      const merged = [...periodByAccount.values(), ...openingOnlyRows]
        .sort((a, b) => String(a.account?.code || "").localeCompare(String(b.account?.code || "")));

      setRows(merged);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, item) => {
        acc.opening += Number(item.opening_balance || 0);
        acc.debit += Number(item.total_debit || 0);
        acc.credit += Number(item.total_credit || 0);
        acc.balance += Number(item.opening_balance || 0) + Number(item.balance || 0);
        return acc;
      },
      {opening: 0, debit: 0, credit: 0, balance: 0}
    );
  }, [rows]);

  return (
    <>
      <form className="grid grid-cols-8 gap-4 mb-4" onSubmit={loadLedger}>
        <div className="col-span-2">
          <Controller
            control={control}
            name="account"
            render={({field}) => (
              <ReactSelect
                {...field}
                options={accountOptions}
                isClearable={true}
                placeholder={t('reports.allLedgers')}
              />
            )}
          />
        </div>
        <div className="col-span-2">
          <Input
            type="datetime-local"
            className="w-full"
            value={filters.date_from}
            onChange={(e) => setFilters((prev) => ({...prev, date_from: e.target.value}))}
          />
        </div>
        <div className="col-span-2">
          <Input
            type="datetime-local"
            className="w-full"
            value={filters.date_to}
            onChange={(e) => setFilters((prev) => ({...prev, date_to: e.target.value}))}
          />
        </div>
        <div>
          <Button variant="primary" type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? t('actions.loading') : t('actions.load')}
          </Button>
        </div>
      </form>

      {isLoading && <Loader lines={8} lineItems={4}/>}

      {!isLoading && (
        <div className="overflow-x-auto">
          <table className="table table-zebra w-full">
            <thead>
            <tr>
              <th>{t('reports.account')}</th>
              <th className="text-right">{t('reports.opening')}</th>
              <th className="text-right">{t('columns.debit')}</th>
              <th className="text-right">{t('columns.credit')}</th>
              <th className="text-right">{t('reports.balance')}</th>
            </tr>
            </thead>
            <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.account?.code || "account"}-${index}`}>
                <td>{row.account?.code} - {row.account?.name}</td>
                <td className="text-right">{formatMoney(Number(row.opening_balance || 0))}</td>
                <td className="text-right">{formatMoney(Number(row.total_debit || 0))}</td>
                <td className="text-right">{formatMoney(Number(row.total_credit || 0))}</td>
                <td className="text-right">{formatMoney(Number(row.opening_balance || 0) + Number(row.balance || 0))}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-500">{t('reports.noLedgerData')}</td>
              </tr>
            )}
            </tbody>
            <tfoot>
            <tr className="font-bold">
              <td>{t('reports.total')}</td>
              <td className="text-right">{formatMoney(totals.opening)}</td>
              <td className="text-right">{formatMoney(totals.debit)}</td>
              <td className="text-right">{formatMoney(totals.credit)}</td>
              <td className="text-right">{formatMoney(totals.balance)}</td>
            </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
};
