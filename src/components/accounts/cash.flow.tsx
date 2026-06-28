import {useEffect, useMemo, useState} from "react";
import {DateTime} from "luxon";
import {useTranslation} from "react-i18next";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Loader} from "@/components/common/loader/loader.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {formatMoney} from "@/components/accounts/account.constants.ts";
import {classifyCashFlowBucket, isCashGroupAccount, toQueryDateTime} from "@/components/accounts/reports.utils.ts";

interface CashFlowRow {
  source_module?: string;
  total_debit: number;
  total_credit: number;
}

export const CashFlow = () => {
  const {t} = useTranslation('accounts');
  const db = useDB();
  const [rows, setRows] = useState<CashFlowRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState({
    date_from: DateTime.now().startOf("month").toFormat("yyyy-MM-dd'T'HH:mm"),
    date_to: DateTime.now().endOf("month").toFormat("yyyy-MM-dd'T'HH:mm"),
  });

  const loadCashFlow = async (event?: any) => {
    event?.preventDefault?.();

    setIsLoading(true);
    try {
      const [lineRows] = await db.query(
        `
          SELECT
            entry.source_module as source_module,
            debit,
            credit,
            account.code, account.name, 
            account.group
          FROM ${Tables.account_journal_lines}
          WHERE entry.date >= <datetime>$date_from
            AND entry.date <= <datetime>$date_to
          FETCH account, account.group, entry
        `,
        {
          date_from: toQueryDateTime(filters.date_from),
          date_to: toQueryDateTime(filters.date_to),
        }
      );

      const grouped: Record<string, CashFlowRow> = {};
      (lineRows || []).forEach((line: any) => {
        if (!isCashGroupAccount(line.account)) {
          return;
        }
        const key = line.entry?.source_module || line.source_module || "unclassified";
        if (!grouped[key]) {
          grouped[key] = {source_module: key, total_debit: 0, total_credit: 0};
        }
        grouped[key].total_debit += Number(line.debit || 0);
        grouped[key].total_credit += Number(line.credit || 0);
      });

      setRows(Object.values(grouped));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCashFlow();
  }, []);

  const buckets = useMemo(() => {
    const grouped = {
      Operating: 0,
      Investing: 0,
      Financing: 0,
    };

    rows.forEach((row) => {
      const net = Number(row.total_debit || 0) - Number(row.total_credit || 0);
      const bucket = classifyCashFlowBucket(row.source_module);
      grouped[bucket] += net;
    });

    return grouped;
  }, [rows]);

  const netCashFlow = buckets.Operating + buckets.Investing + buckets.Financing;

  return (
    <>
      <form className="grid grid-cols-5 gap-4 mb-4" onSubmit={loadCashFlow}>
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
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded-lg bg-white">
            <div className="border-b p-3 font-semibold">{t('reports.cashFlowBySource')}</div>
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                <tr>
                  <th>{t('reports.sourceModule')}</th>
                  <th>{t('reports.bucket')}</th>
                  <th className="text-right">{t('reports.netCash')}</th>
                </tr>
                </thead>
                <tbody>
                {rows.map((row, index) => {
                  const net = Number(row.total_debit || 0) - Number(row.total_credit || 0);
                  return (
                    <tr key={`${row.source_module || "source"}-${index}`}>
                      <td>{row.source_module || "unclassified"}</td>
                      <td>{classifyCashFlowBucket(row.source_module)}</td>
                      <td className="text-right">{formatMoney(net)}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-gray-500">{t('reports.noCashFlow')}</td>
                  </tr>
                )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border rounded-lg bg-white">
            <div className="border-b p-3 font-semibold">{t('reports.cashFlowSummary')}</div>
            <div className="p-3 space-y-3">
              <div className="flex justify-between">
                <span>{t('reports.operating')}</span>
                <span>{formatMoney(buckets.Operating)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('reports.investing')}</span>
                <span>{formatMoney(buckets.Investing)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('reports.financing')}</span>
                <span>{formatMoney(buckets.Financing)}</span>
              </div>
              <div className="border-t pt-3 font-semibold flex justify-between">
                <span>{t('reports.netCashMovement')}</span>
                <span>{formatMoney(netCashFlow)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
