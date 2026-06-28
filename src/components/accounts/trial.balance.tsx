import {useEffect, useMemo, useState} from "react";
import {DateTime} from "luxon";
import {useTranslation} from "react-i18next";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Loader} from "@/components/common/loader/loader.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {toRecordId} from "@/lib/utils.ts";
import {formatMoney} from "@/components/accounts/account.constants.ts";

interface TrialBalanceRow {
  account: {
    code: string;
    name: string;
  };
  total_debit: number;
  total_credit: number;
}

export const TrialBalance = () => {
  const {t} = useTranslation('accounts');
  const db = useDB();
  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [asOf, setAsOf] = useState(DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm"));

  const loadTrialBalance = async (event?: any) => {
    event?.preventDefault?.();

    setIsLoading(true);
    try {
      const [result] = await db.query(`
          SELECT 
                 account,
                 account.code,
                 account.name,
                 math::sum(debit) as total_debit, math::sum(credit) as total_credit
          FROM ${Tables.account_journal_lines}
          WHERE entry.date <= <datetime>$as_of
          GROUP BY account.code, account.name
          ORDER BY account.code ASC
              FETCH account
      `, {
        as_of: DateTime.fromFormat(asOf, "yyyy-MM-dd'T'HH:mm").toJSDate(),
      });

      setRows(result || []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTrialBalance();
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, item) => {
        const debit = Number(item.total_debit || 0);
        const credit = Number(item.total_credit || 0);
        acc.totalDebit += debit;
        acc.totalCredit += credit;
        acc.closingDebit += Math.max(debit - credit, 0);
        acc.closingCredit += Math.max(credit - debit, 0);
        return acc;
      },
      {totalDebit: 0, totalCredit: 0, closingDebit: 0, closingCredit: 0}
    );
  }, [rows]);

  return (
    <>
      <form className="grid grid-cols-4 gap-4 mb-4" onSubmit={loadTrialBalance}>
        <div className="col-span-3">
          <Input
            type="datetime-local"
            className="w-full"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
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
              <th className="text-right">{t('reports.totalDebit')}</th>
              <th className="text-right">{t('reports.totalCredit')}</th>
              <th className="text-right">{t('reports.closingDebit')}</th>
              <th className="text-right">{t('reports.closingCredit')}</th>
            </tr>
            </thead>
            <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.account?.code || "account"}-${index}`}>
                <td>{row.account?.code} - {row.account?.name}</td>
                <td className="text-right">{formatMoney(Number(row.total_debit || 0))}</td>
                <td className="text-right">{formatMoney(Number(row.total_credit || 0))}</td>
                <td className="text-right">{formatMoney(Math.max(Number(row.total_debit || 0) - Number(row.total_credit || 0), 0))}</td>
                <td className="text-right">{formatMoney(Math.max(Number(row.total_credit || 0) - Number(row.total_debit || 0), 0))}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-500">{t('reports.noTrialBalance')}</td>
              </tr>
            )}
            </tbody>
            <tfoot>
            <tr className="font-bold">
              <td>{t('reports.total')}</td>
              <td className="text-right">{formatMoney(totals.totalDebit)}</td>
              <td className="text-right">{formatMoney(totals.totalCredit)}</td>
              <td className="text-right">{formatMoney(totals.closingDebit)}</td>
              <td className="text-right">{formatMoney(totals.closingCredit)}</td>
            </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
};
