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
      title={viewEntry ? `${t('forms.journalEntry')} #${viewEntry.entry_number}` : t('forms.journalEntry')}
      open={open}
      onClose={onClose}
      size="xl"
    >
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-border border-t-primary"></div>
        </div>
      )}

      {!loading && viewEntry && (
        <div className="space-y-6">
          <div className="bg-surface-elevated rounded-xl shadow border border-border p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">
                {t('forms.journalEntry')} #{viewEntry.entry_number}
              </div>
              <div className="text-xs text-muted">
                {viewEntry.date ? toJsDate(viewEntry.date).toLocaleString() : "—"}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-foreground">
              <div>
                <div className="text-muted text-xs uppercase">{t('columns.module')}</div>
                <div>{viewEntry.source_module ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted text-xs uppercase">{t('columns.sourceId')}</div>
                <div>{viewEntry.source_id ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted text-xs uppercase">{t('columns.createdBy')}</div>
                <div>{viewEntry.created_by?.first_name} {viewEntry?.created_by?.last_name}</div>
              </div>
              <div>
                <div className="text-muted text-xs uppercase">{t('columns.status')}</div>
                <div className={
                  viewEntry.status === 'posted' ? "text-success-600 font-medium"
                    : viewEntry.status === 'reversed' ? "text-muted font-medium"
                      : "text-warning-600 font-medium"
                }>
                  {viewEntry.status === 'posted' ? t('status.posted')
                    : viewEntry.status === 'reversed' ? t('status.reversed')
                      : t('status.draft')}
                </div>
              </div>
              <div className="md:col-span-4">
                <div className="text-muted text-xs uppercase">{t('columns.memo')}</div>
                <div>{viewEntry.memo || "—"}</div>
              </div>
            </div>
          </div>

          <div className="bg-surface-elevated rounded-xl shadow border border-border">
            <div className="text-sm font-semibold text-foreground p-4 border-b border-border">
              {t('tabs.lines')}
            </div>
            {viewEntry.lines && viewEntry.lines.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface text-muted uppercase text-xs">
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
                        <td className="px-4 py-3 font-medium text-foreground">
                          {line.account?.code} - {line.account?.name}
                        </td>
                        <td className="px-4 py-3 text-muted">
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
                  <tfoot className="bg-surface font-semibold">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-right">{t('reports.total')}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(debitTotal)}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(creditTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="p-4 text-sm text-muted">
                {t('messages.noJournalLines')}
              </div>
            )}
          </div>

          {viewEntry.documents && viewEntry.documents.length > 0 && (
            <div className="bg-surface-elevated rounded-xl shadow border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FontAwesomeIcon icon={faFile}/>
                  <span>{t('upload.documents')}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {viewEntry.documents.map((doc: any, index: number) => (
                  <div
                    key={doc.id ?? index}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-surface"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-8 w-8 rounded-md bg-primary/10 text-primary-600 flex items-center justify-center">
                        <FontAwesomeIcon icon={faFile}/>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-foreground truncate">
                          {doc.name ?? t('upload.documentN', {n: index + 1})}
                        </span>
                        <span className="text-xs text-muted">
                          {doc.mimeType ?? t('upload.file')}
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
                      {t('actions.download')}
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
