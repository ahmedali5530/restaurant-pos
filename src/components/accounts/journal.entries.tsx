import {useMemo, useState} from "react";
import {createColumnHelper} from "@tanstack/react-table";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus} from "@fortawesome/free-solid-svg-icons";
import {DateTime} from "luxon";
import {useTranslation} from "react-i18next";
import {Button} from "@/components/common/input/button.tsx";
import {TableComponent} from "@/components/common/table/table.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {AccountJournalEntry} from "@/api/model/account.journal.entry.ts";
import {Account} from "@/api/model/account.ts";
import {CreateJournalEntry} from "@/components/accounts/create.journal.entry.tsx";
import {formatMoney} from "@/components/accounts/account.constants.ts";

export const JournalEntries = () => {
  const {t} = useTranslation('accounts');
  const [modal, setModal] = useState(false);

  const accountHook = useApi<SettingsData<Account>>(
    Tables.accounts,
    [`is_active = true`],
    ["account.code ASC"]
  );

  const journalHook = useApi<SettingsData<AccountJournalEntry>>(
    Tables.account_journal_entries,
    [],
    ["date DESC"],
    0,
    25,
    ["lines", "lines.account", "lines.account.group", "created_by"],
  );

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
    columnHelper.accessor("posted", {
      header: t('columns.status'),
      cell: (info) => (
        <span className={info.getValue() ? "text-success-600" : "text-warning-600"}>
          {info.getValue() ? t('status.posted') : t('status.draft')}
        </span>
      ),
    }),
  ], [columnHelper, t]);

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
            <FontAwesomeIcon icon={faPlus} className="mr-2"/> {t('actions.journalEntry')}
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
    </>
  );
};
