import {useEffect, useMemo, useState} from "react";
import {DateTime} from "luxon";
import {useTranslation} from "react-i18next";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Loader} from "@/components/common/loader/loader.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {formatMoney} from "@/components/accounts/account.constants.ts";
import {getAccountHeadType, toAccountBalance, toQueryDateTime} from "@/components/accounts/reports.utils.ts";

interface BalanceSheetRow {
  account: {
    code: string;
    name: string;
    account_type?: string;
    group?: {head_type?: string; normal_balance?: string};
    normal_balance?: string;
  };
  total_debit: number;
  total_credit: number;
}

export const BalanceSheet = () => {
  const {t} = useTranslation('accounts');
  const db = useDB();
  const [rows, setRows] = useState<BalanceSheetRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [asOf, setAsOf] = useState(DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm"));

  const loadBalanceSheet = async (event?: any) => {
    event?.preventDefault?.();

    setIsLoading(true);
    try {
      const [result] = await db.query(
        `
          SELECT
                 account,
                 account.code,
                 account.name,
                 account.group,
                 math::sum(debit) as total_debit,
                 math::sum(credit) as total_credit
          FROM ${Tables.account_journal_lines}
          WHERE entry.date <= <datetime>$as_of
          GROUP BY account.code, account.name, account.group
          ORDER BY account.code ASC
          FETCH account, account.group
        `,
        {
          as_of: toQueryDateTime(asOf),
        }
      );
      setRows(result || []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBalanceSheet();
  }, []);

  const summary = useMemo(() => {
    const sections = {
      asset: [] as Array<BalanceSheetRow & {balance: number}>,
      liability: [] as Array<BalanceSheetRow & {balance: number}>,
      equity: [] as Array<BalanceSheetRow & {balance: number}>,
    };

    rows.forEach((row) => {
      const head = getAccountHeadType(row.account);
      if (!head || !["asset", "liability", "equity"].includes(head)) {
        return;
      }
      const normalBalance = row.account?.normal_balance || row.account?.group?.normal_balance;
      const rowWithBalance = {
        ...row,
        balance: toAccountBalance(
          Number(row.total_debit || 0),
          Number(row.total_credit || 0),
          normalBalance
        ),
      };

      if (head === "asset") {
        sections.asset.push(rowWithBalance);
      } else if (head === "liability") {
        sections.liability.push(rowWithBalance);
      } else if (head === "equity") {
        sections.equity.push(rowWithBalance);
      }
    });

    const totalAssets = sections.asset.reduce((sum, row) => sum + row.balance, 0);
    const totalLiabilities = sections.liability.reduce((sum, row) => sum + row.balance, 0);
    const totalEquity = sections.equity.reduce((sum, row) => sum + row.balance, 0);

    return {
      sections,
      totalAssets,
      totalLiabilities,
      totalEquity,
      rhs: totalLiabilities + totalEquity,
    };
  }, [rows]);

  return (
    <>
      <form className="grid grid-cols-4 gap-4 mb-4" onSubmit={loadBalanceSheet}>
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
        <div className="grid grid-cols-3 gap-4">
          {[
            {key: "asset", title: t('reports.assets'), rows: summary.sections.asset, total: summary.totalAssets},
            {key: "liability", title: t('reports.liabilities'), rows: summary.sections.liability, total: summary.totalLiabilities},
            {key: "equity", title: t('reports.equity'), rows: summary.sections.equity, total: summary.totalEquity},
          ].map((section) => (
            <div key={section.key} className="border rounded-lg bg-white">
              <div className="border-b p-3 font-semibold">{section.title}</div>
              <div className="p-3 space-y-2">
                {section.rows.map((row, index) => (
                  <div key={`${row.account?.code || section.key}-${index}`} className="flex justify-between">
                    <span>{row.account?.code} - {row.account?.name}</span>
                    <span>{formatMoney(row.balance)}</span>
                  </div>
                ))}
                {section.rows.length === 0 && <div className="text-gray-500">{t('reports.noData')}</div>}
              </div>
              <div className="border-t p-3 font-semibold flex justify-between">
                <span>{t('reports.total')} {section.title}</span>
                <span>{formatMoney(section.total)}</span>
              </div>
            </div>
          ))}

          <div className="col-span-3 border rounded-lg bg-primary-50 border-primary-200 p-4 font-semibold">
            <div className="flex justify-between">
              <span>{t('reports.equationCheck')}</span>
              <span>{formatMoney(summary.totalAssets)} vs {formatMoney(summary.rhs)}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
