import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faPlus, faUndo } from "@fortawesome/free-solid-svg-icons";
import { DateTime } from "luxon";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/common/input/button.tsx";
import { TableComponent } from "@/components/common/table/table.tsx";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { AccountJournalEntry } from "@/api/model/account.journal.entry.ts";
import { Account } from "@/api/model/account.ts";
import { CreateJournalEntry } from "@/components/accounts/create.journal.entry.tsx";
import { ViewJournalEntry } from "@/components/accounts/view.journal.entry.tsx";
import { formatMoney } from "@/components/accounts/account.constants.ts";
import { useDB } from "@/api/db/db.ts";
import { toast } from "sonner";
import { StringRecordId } from "surrealdb";
import { appPage } from "@/store/jotai.ts";
import { useAtom } from "jotai";

export const JournalEntries = () => {
  const { t } = useTranslation('accounts');
  const db = useDB();
  const [{ user }] = useAtom(appPage);
  const [modal, setModal] = useState(false);
  const [viewModal, setViewModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<AccountJournalEntry | null>(null);

  const accountHook = useApi<SettingsData<Account>>(
    Tables.accounts,
    [`is_active = true`],
    ["account.code ASC"]
  );

  const journalHook = useApi<SettingsData<AccountJournalEntry>>(
    Tables.account_journal_entries,
    [],
    ["entry_number DESC", "date DESC"],
    0,
    25,
    ["lines", "lines.account", "lines.account.group", "created_by"],
  );

  const handleReverse = async (entry: AccountJournalEntry) => {
    if (!window.confirm(t('messages.confirmReverse', 'Are you sure you want to reverse this journal entry?'))) {
      return;
    }
    try {
      const [fullEntry] = await db.query(`SELECT * FROM ONLY ${entry.id} FETCH lines`);
      if (!fullEntry) {
        throw new Error('Entry not found');
      }

      if (fullEntry.status !== 'posted') {
        toast.error(t('messages.cannotReverse', 'Only posted entries can be reversed'));
        return;
      }

      const [rows] = await db.query(`SELECT math::max(<int>entry_number) as max_value
                                     FROM ${Tables.account_journal_entries}
                                     GROUP ALL`);
      const num = Number(rows?.[0]?.max_value || 0);
      const nextEntryNumber = isFinite(num) ? num + 1 : 1;

      const [newEntry] = await db.insert(Tables.account_journal_entries, {
        entry_number: nextEntryNumber,
        date: new Date(),
        memo: `(Reversal) ${fullEntry.memo || ''}`.trim(),
        source_module: fullEntry.source_module || null,
        source_id: fullEntry.source_id || null,
        created_by: user?.id ? new StringRecordId(user.id.toString()) : null,
        status: 'posted',
      });

      const lineIds: any[] = [];
      for (const line of fullEntry.lines || []) {
        const [createdLine] = await db.insert(Tables.account_journal_lines, {
          entry: new StringRecordId(newEntry.id.toString()),
          account: line.account,
          debit: Number(line.credit || 0), // Swap
          credit: Number(line.debit || 0), // Swap
          description: line.description || null,
        });
        lineIds.push(createdLine.id);
      }

      await db.merge(new StringRecordId(newEntry.id.toString()), {
        lines: lineIds,
      });

      await db.merge(new StringRecordId(entry.id.toString()), {
        status: 'reversed',
      });

      toast.success(t('messages.reverseSuccess', 'Journal entry reversed successfully'));
      await journalHook.fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to reverse entry');
    }
  };

  const columnHelper = createColumnHelper<AccountJournalEntry>();
  const columns = useMemo(() => [
    columnHelper.accessor("entry_number", {
      header: t('columns.entryNumber'),
    }),
    columnHelper.accessor("date", {
      header: t('columns.date'),
      cell: (info) => {
        const date = info.getValue();
        if (!date) {
          return "-";
        }
        return DateTime.fromJSDate(new Date(date)).toFormat("yyyy-LL-dd HH:mm");
      },
    }),
    columnHelper.accessor("source_module", {
      header: t('columns.module'),
      cell: (info) => info.getValue() || "-",
    }),
    columnHelper.accessor("source_id", {
      header: t('columns.sourceId'),
      cell: (info) => info.getValue() || "-",
    }),
    columnHelper.accessor("memo", {
      header: t('columns.memo'),
      cell: (info) => info.getValue() || "-",
    }),
    columnHelper.accessor("lines", {
      header: t('columns.debit'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const lines = info.getValue() || [];
        const total = lines.reduce((sum: number, line: any) => sum + Number(line.debit || 0), 0);
        return formatMoney(total);
      }
    }),
    columnHelper.accessor("id", {
      header: t('columns.credit'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const lines = info.row.original.lines || [];
        const total = lines.reduce((sum: number, line: any) => sum + Number(line.credit || 0), 0);
        return formatMoney(total);
      }
    }),
    columnHelper.accessor("status", {
      header: t('columns.status'),
      cell: (info) => {
        const status = info.getValue();
        const className =
          status === 'posted' ? 'text-success-600'
            : status === 'reversed' ? 'text-neutral-500'
              : 'text-warning-600';
        const label =
          status === 'posted' ? t('status.posted')
            : status === 'reversed' ? t('status.reversed')
              : t('status.draft');
        return <span className={className}>{label}</span>;
      },
    }),
    columnHelper.display({
      id: "actions",
      header: t('columns.actions', 'Actions'),
      cell: (info) => (
        <div className="flex gap-2 justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              setSelectedEntry(info.row.original);
              setViewModal(true);
            }}
          >
            <FontAwesomeIcon icon={faEye} />
          </Button>
          {info.row.original.status === 'posted' && (
            <Button
              variant="warning"
              onClick={() => handleReverse(info.row.original)}
            >
              <FontAwesomeIcon icon={faUndo} />
            </Button>
          )}
        </div>
      ),
    }),
  ], [columnHelper, t, db, user, journalHook]);

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={journalHook}
        loaderLineItems={6}
        buttons={[
          <Button
            key="new-journal-entry"
            variant="primary"
            onClick={() => setModal(true)}
            disabled={(accountHook?.data?.data || []).length < 2}
          >
            <FontAwesomeIcon icon={faPlus} className="mr-2" /> {t('actions.journalEntry')}
          </Button>
        ]}
      />

      {(accountHook?.data?.data || []).length < 2 && (
        <p className="text-warning-700 text-sm">
          {t('messages.needTwoAccounts')}
        </p>
      )}

      {modal && (
        <CreateJournalEntry
          addModal={modal}
          accounts={accountHook?.data?.data || []}
          onClose={async () => {
            setModal(false);
            await journalHook.fetchData();
          }}
        />
      )}

      {viewModal && selectedEntry && (
        <ViewJournalEntry
          open={viewModal}
          entry={selectedEntry}
          onClose={() => {
            setViewModal(false);
            setSelectedEntry(null);
          }}
        />
      )}
    </>
  );
};
