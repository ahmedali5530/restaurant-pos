import {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faDownload, faFile} from "@fortawesome/free-solid-svg-icons";
import {downloadArrayBuffer} from "@/utils/files.ts";
import {Button} from "@/components/common/input/button.tsx";
import {toJsDate} from "@/lib/datetime.ts";
import {AccountJournalEntry} from "@/api/model/account.journal.entry.ts";
import {formatMoney} from "@/components/accounts/account.constants.ts";

interface Props {
  open: boolean;
  entry: AccountJournalEntry | null;
  onClose: () => void;
}

export const ViewJournalEntry = ({open, entry, onClose}: Props) => {
  const {t} = useTranslation('accounts');
  const db = useDB();
  const [viewEntry, setViewEntry] = useState<AccountJournalEntry | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!open || !entry?.id) {
        setViewEntry(null);
        return;
      }

      setLoading(true);
      try {
        const [result] = await db.query(
          `SELECT * FROM ONLY ${entry.id} FETCH lines, lines.account, created_by, documents`
        );
        setViewEntry(result as any);
      } catch (e) {
        console.error("Failed to load journal entry details", e);
        setViewEntry(null);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [open, entry?.id]);

  if (!open) {
    return null;
  }

  const debitTotal = (viewEntry?.lines || []).reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const creditTotal = (viewEntry?.lines || []).reduce((sum, line) => sum + Number(line.credit || 0), 0);

  return (
    <Modal
      title={viewEntry ? `${t('forms.journalEntry', 'Journal Entry')} #${viewEntry.entry_number}` : t('forms.journalEntry', 'Journal Entry')}
      open={open}
      onClose={onClose}
      size="xl"
    >
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-neutral-300 border-t-primary-500"></div>
        </div>
      )}

      {!loading && viewEntry && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow border border-neutral-200 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">
                {t('forms.journalEntry', 'Journal Entry')} #{viewEntry.entry_number}
              </div>
              <div className="text-xs text-neutral-500">
                {viewEntry.date ? toJsDate(viewEntry.date).toLocaleString() : "—"}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-neutral-700">
              <div>
                <div className="text-neutral-500 text-xs uppercase">{t('columns.module', 'Module')}</div>
                <div>{viewEntry.source_module ?? "—"}</div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs uppercase">{t('columns.sourceId', 'Source ID')}</div>
                <div>{viewEntry.source_id ?? "—"}</div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs uppercase">{t('columns.createdBy')}</div>
                <div>{viewEntry.created_by?.first_name} {viewEntry?.created_by?.last_name}</div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs uppercase">{t('columns.status')}</div>
                <div className={
                  viewEntry.status === 'posted' ? "text-success-600 font-medium"
                    : viewEntry.status === 'reversed' ? "text-neutral-500 font-medium"
                      : "text-warning-600 font-medium"
                }>
                  {viewEntry.status === 'posted' ? t('status.posted')
                    : viewEntry.status === 'reversed' ? t('status.reversed')
                      : t('status.draft')}
                </div>
              </div>
              <div className="md:col-span-4">
                <div className="text-neutral-500 text-xs uppercase">{t('columns.memo', 'Memo')}</div>
                <div>{viewEntry.memo || "—"}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow border border-neutral-200">
            <div className="text-sm font-semibold text-neutral-800 p-4 border-b border-neutral-200">
              {t('tabs.lines', 'Lines')}
            </div>
            {viewEntry.lines && viewEntry.lines.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-neutral-50 text-neutral-500 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-2">{t('reports.account')}</th>
                      <th className="px-4 py-2">{t('reports.description')}</th>
                      <th className="px-4 py-2 text-right">{t('columns.debit')}</th>
                      <th className="px-4 py-2 text-right">{t('columns.credit')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {viewEntry.lines.map((line: any) => (
                      <tr key={line.id}>
                        <td className="px-4 py-3 font-medium text-neutral-800">
                          {line.account?.code} - {line.account?.name}
                        </td>
                        <td className="px-4 py-3 text-neutral-600">
                          {line.description || "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatMoney(Number(line.debit || 0))}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatMoney(Number(line.credit || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-neutral-50 font-semibold">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-right">{t('reports.total', 'Total')}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(debitTotal)}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(creditTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="p-4 text-sm text-neutral-500">
                No lines found for this journal entry.
              </div>
            )}
          </div>

          {viewEntry.documents && viewEntry.documents.length > 0 && (
            <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
                  <FontAwesomeIcon icon={faFile}/>
                  <span>{t('upload.documents', 'Documents')}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {viewEntry.documents.map((doc: any, index: number) => (
                  <div
                    key={doc.id ?? index}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-8 w-8 rounded-md bg-primary-50 text-primary-600 flex items-center justify-center">
                        <FontAwesomeIcon icon={faFile}/>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-neutral-800 truncate">
                          {doc.name ?? `Document ${index + 1}`}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {doc.mimeType ?? "File"}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        downloadArrayBuffer(
                          doc.content,
                          doc.name ?? `entry-${viewEntry.entry_number}-${index + 1}`,
                          doc.mimeType ?? "application/octet-stream"
                        )
                      }
                    >
                      <FontAwesomeIcon icon={faDownload} className="mr-1"/>
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
