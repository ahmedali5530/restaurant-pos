import {useEffect, useMemo, useState} from "react";
import {DateTime} from "luxon";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faEye} from "@fortawesome/free-solid-svg-icons";
import {useTranslation} from "react-i18next";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Loader} from "@/components/common/loader/loader.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {toRecordId} from "@/lib/utils.ts";
import {formatMoney} from "@/components/accounts/account.constants.ts";
import {computeRunningBalances, sortJournalLinesByEntry, toQueryDateTime} from "@/components/accounts/reports.utils.ts";
import {ViewJournalEntry} from "@/components/accounts/view.journal.entry.tsx";
import {AccountJournalEntry} from "@/api/model/account.journal.entry.ts";

interface LedgerAccount {
  id?: string;
  code: string;
  name: string;
}

interface LedgerLineRow {
  id?: string;
  debit?: number;
  credit?: number;
  description?: string;
  running_balance?: number;
  entry?: {
    id?: string;
    entry_number?: number;
    date?: string | Date;
    memo?: string;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  account: LedgerAccount | null;
  dateFrom: string;
  dateTo: string;
  openingBalance: number;
}

const resolveAccountId = (account?: LedgerAccount | null) => {
  const id = account?.id;
  if (!id) {
    return undefined;
  }
  return id.toString();
};

const formatDateRangeLabel = (value: string) => {
  if (!value) {
    return "—";
  }
  const parsed = DateTime.fromFormat(value, "yyyy-MM-dd'T'HH:mm");
  return parsed.isValid ? parsed.toFormat("yyyy-LL-dd HH:mm") : value;
};

export const LedgerEntriesModal = ({
  open,
  onClose,
  account,
  dateFrom,
  dateTo,
  openingBalance,
}: Props) => {
  const {t} = useTranslation('accounts');
  const db = useDB();
  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState<LedgerLineRow[]>([]);
  const [viewEntryOpen, setViewEntryOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<AccountJournalEntry | null>(null);

  const accountId = resolveAccountId(account);

  useEffect(() => {
    if (!open || !accountId) {
      setRows([]);
      return;
    }

    let cancelled = false;

    const loadLines = async () => {
      setIsLoading(true);
      try {
        const [lineRows] = await db.query(
          `
            SELECT *
            FROM ${Tables.account_journal_lines}
            WHERE account = $account
              AND entry.date >= <datetime>$date_from
              AND entry.date <= <datetime>$date_to
            ORDER BY entry.date ASC, entry.entry_number ASC
            FETCH entry
          `,
          {
            account: toRecordId(accountId),
            date_from: toQueryDateTime(dateFrom),
            date_to: toQueryDateTime(dateTo),
          },
        );

        if (cancelled) {
          return;
        }

        const sorted = sortJournalLinesByEntry((lineRows || []) as LedgerLineRow[]);
        const withRunning = computeRunningBalances(openingBalance, sorted);
        setRows(withRunning as LedgerLineRow[]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadLines();

    return () => {
      cancelled = true;
    };
  }, [open, accountId, dateFrom, dateTo, openingBalance]);

  const closingBalance = useMemo(() => {
    if (rows.length === 0) {
      return openingBalance;
    }
    return Number(rows[rows.length - 1].running_balance || 0);
  }, [rows, openingBalance]);

  const periodDebits = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.debit || 0), 0),
    [rows],
  );
  const periodCredits = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.credit || 0), 0),
    [rows],
  );

  const handleClose = () => {
    setViewEntryOpen(false);
    setSelectedEntry(null);
    onClose();
  };

  const accountLabel = account ? `${account.code} - ${account.name}` : "";
  const title = account
    ? t('reports.ledgerEntriesFor', {
      account: accountLabel,
      from: formatDateRangeLabel(dateFrom),
      to: formatDateRangeLabel(dateTo),
    })
    : t('reports.ledgerEntries');

  if (!open) {
    return null;
  }

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        size="xl"
        title={title}
      >
        <div className="p-3 border-b grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
          <div>{t('reports.openingBalance')}: <strong>{formatMoney(openingBalance)}</strong></div>
          <div>{t('reports.totalDebits')}: <strong>{formatMoney(periodDebits)}</strong></div>
          <div>{t('reports.totalCredits')}: <strong>{formatMoney(periodCredits)}</strong></div>
          <div>{t('reports.closingBalance')}: <strong>{formatMoney(closingBalance)}</strong></div>
        </div>

        {isLoading && <Loader lines={8} lineItems={4}/>}

        {!isLoading && (
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
                <th>{t('columns.actions')}</th>
              </tr>
              </thead>
              <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.id || row.entry?.id || "row"}-${index}`}>
                  <td>
                    {row.entry?.date
                      ? DateTime.fromJSDate(new Date(row.entry.date)).toFormat("yyyy-LL-dd HH:mm")
                      : "-"}
                  </td>
                  <td>{row.entry?.entry_number ?? "-"}</td>
                  <td>{row.description || row.entry?.memo || "-"}</td>
                  <td className="text-right">{formatMoney(Number(row.debit || 0))}</td>
                  <td className="text-right">{formatMoney(Number(row.credit || 0))}</td>
                  <td className="text-right">{formatMoney(Number(row.running_balance || 0))}</td>
                  <td>
                    {row.entry?.id && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelectedEntry({
                            id: row.entry!.id!,
                            entry_number: row.entry?.entry_number ?? 0,
                            date: row.entry?.date ?? new Date(),
                            status: 'posted',
                          });
                          setViewEntryOpen(true);
                        }}
                      >
                        <FontAwesomeIcon icon={faEye}/>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-gray-500">
                    {t('reports.noLedgerEntries')}
                  </td>
                </tr>
              )}
              </tbody>
              <tfoot>
              <tr className="font-bold">
                <td colSpan={5}>{t('reports.closingBalance')}</td>
                <td className="text-right">{formatMoney(closingBalance)}</td>
                <td></td>
              </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Modal>

      {viewEntryOpen && selectedEntry && (
        <ViewJournalEntry
          open={viewEntryOpen}
          entry={selectedEntry}
          onClose={() => {
            setViewEntryOpen(false);
            setSelectedEntry(null);
          }}
        />
      )}
    </>
  );
};
