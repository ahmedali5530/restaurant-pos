import {useEffect, useMemo, useState} from "react";
import {DateTime} from "luxon";
import {Controller, useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Account} from "@/api/model/account.ts";
import {Tables} from "@/api/db/tables.ts";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Loader} from "@/components/common/loader/loader.tsx";
import {useDB} from "@/api/db/db.ts";
import {toRecordId} from "@/lib/utils.ts";
import {formatMoney} from "@/components/accounts/account.constants.ts";
import {computeRunningBalances, isSupplierAccount, toQueryDateTime} from "@/components/accounts/reports.utils.ts";

interface StatementRow {
  id: string;
  debit: number;
  credit: number;
  description?: string;
  entry?: {
    entry_number?: number;
    date?: string | Date;
    memo?: string;
  };
  running_balance?: number;
}

export const SupplierStatement = () => {
  const {t} = useTranslation('accounts');
  const db = useDB();
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [filters, setFilters] = useState({
    date_from: DateTime.now().startOf("month").toFormat("yyyy-MM-dd'T'HH:mm"),
    date_to: DateTime.now().endOf("month").toFormat("yyyy-MM-dd'T'HH:mm"),
  });
  const {control, watch} = useForm({
    defaultValues: {
      account: null as {label: string; value: string} | null,
    }
  });
  const selectedAccount = watch("account");

  const accountHook = useApi<SettingsData<Account>>(
    Tables.accounts,
    [`is_active = true`],
    ["account.code ASC"],
    0,
    9999,
    ["group"],
  );

  const accountOptions = useMemo(() => {
    return (accountHook.data?.data || [])
      .filter((account) => isSupplierAccount(account))
      .map((account) => ({
        label: `${account.code} - ${account.name}`,
        value: account.id.toString(),
      }));
  }, [accountHook.data?.data]);

  const loadStatement = async (event?: any) => {
    event?.preventDefault?.();
    if (!selectedAccount?.value) {
      setRows([]);
      setOpeningBalance(0);
      setClosingBalance(0);
      return;
    }

    setIsLoading(true);
    try {
      const params = {
        account: toRecordId(selectedAccount.value),
        date_from: toQueryDateTime(filters.date_from),
        date_to: toQueryDateTime(filters.date_to),
      };

      const [openingRows] = await db.query(
        `
          SELECT math::sum(debit - credit) as opening
          FROM ${Tables.account_journal_lines}
          WHERE entry.store = $store
            AND account = $account
            AND entry.date < <datetime>$date_from
          GROUP ALL
        `,
        params
      );
      const opening = Number(openingRows?.[0]?.opening || 0);

      const [lineRows] = await db.query(
        `
          SELECT *
          FROM ${Tables.account_journal_lines}
          WHERE entry.store = $store
            AND account = $account
            AND entry.date >= <datetime>$date_from
            AND entry.date <= <datetime>$date_to
          ORDER BY entry.date ASC
          FETCH entry
        `,
        params
      );

      const withRunning = computeRunningBalances(opening, lineRows || []);
      setOpeningBalance(opening);
      setRows(withRunning as StatementRow[]);
      setClosingBalance(withRunning.length > 0 ? Number(withRunning[withRunning.length - 1].running_balance || 0) : opening);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setRows([]);
    setOpeningBalance(0);
    setClosingBalance(0);
  }, [selectedAccount?.value]);

  return (
    <>
      <form className="grid grid-cols-8 gap-4 mb-4" onSubmit={loadStatement}>
        <div className="col-span-2">
          <Controller
            control={control}
            name="account"
            render={({field}) => (
              <ReactSelect
                {...field}
                options={accountOptions}
                placeholder={t('reports.selectSupplierAccount')}
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
        <div className="col-span-2">
          <Button variant="primary" type="submit" className="w-full" disabled={isLoading || !selectedAccount?.value}>
            {isLoading ? t('actions.loading') : t('actions.load')}
          </Button>
        </div>
      </form>

      {!selectedAccount?.value && (
        <div className="text-sm text-warning-700 mb-3">
          {t('reports.supplierHint')}
        </div>
      )}

      {isLoading && <Loader lines={8} lineItems={4}/>}

      {!isLoading && selectedAccount?.value && (
        <div className="border rounded-lg bg-white">
          <div className="p-3 border-b grid grid-cols-3 gap-3 text-sm">
            <div>{t('reports.openingBalance')}: <strong>{formatMoney(openingBalance)}</strong></div>
            <div>{t('reports.totalDebits')}: <strong>{formatMoney(rows.reduce((sum, row) => sum + Number(row.debit || 0), 0))}</strong></div>
            <div>{t('reports.totalCredits')}: <strong>{formatMoney(rows.reduce((sum, row) => sum + Number(row.credit || 0), 0))}</strong></div>
          </div>
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
              <tr>
                <th>{t('columns.date')}</th>
                <th>{t('columns.entryNumber')}</th>
                <th>{t('reports.description')}</th>
                <th className="text-right">{t('columns.debit')}</th>
                <th className="text-right">{t('columns.credit')}</th>
                <th className="text-right">{t('reports.runningBalance')}</th>
              </tr>
              </thead>
              <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.id || "row"}-${index}`}>
                  <td>{row.entry?.date ? DateTime.fromJSDate(new Date(row.entry.date)).toFormat("yyyy-LL-dd HH:mm") : "-"}</td>
                  <td>{row.entry?.entry_number || "-"}</td>
                  <td>{row.description || row.entry?.memo || "-"}</td>
                  <td className="text-right">{formatMoney(Number(row.debit || 0))}</td>
                  <td className="text-right">{formatMoney(Number(row.credit || 0))}</td>
                  <td className="text-right">{formatMoney(Number(row.running_balance || 0))}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-500">{t('reports.noStatementEntries')}</td>
                </tr>
              )}
              </tbody>
              <tfoot>
              <tr className="font-bold">
                <td colSpan={5}>{t('reports.closingBalance')}</td>
                <td className="text-right">{formatMoney(closingBalance)}</td>
              </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  );
};
