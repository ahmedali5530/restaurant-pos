import {useMemo, useRef, useState} from "react";
import {createColumnHelper} from "@tanstack/react-table";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencilAlt, faPlus, faUpload} from "@fortawesome/free-solid-svg-icons";
import {StringRecordId} from "surrealdb";
import {useTranslation} from "react-i18next";
import {toast} from "sonner";
import {useDB} from "@/api/db/db.ts";
import {Account} from "@/api/model/account.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {Button} from "@/components/common/input/button.tsx";
import {Switch} from "@/components/common/input/switch.tsx";
import {TableComponent} from "@/components/common/table/table.tsx";
import {CreateAccount} from "@/components/accounts/create.account.tsx";
import {CsvUploadModal} from "@/components/common/table/csv.uploader.tsx";
import {toRecordId} from "@/lib/utils.ts";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";

export const ChartOfAccounts = () => {
  const {t} = useTranslation(['accounts', 'common']);
  const db = useDB();
  const [modal, setModal] = useState(false);
  const [csvUploader, setCsvUploader] = useState(false);
  const [operation, setOperation] = useState<"create" | "update">("create");
  const [account, setAccount] = useState<Account>();
  const [activateConfirm, setActivateConfirm] = useState<Account | null>(null);
  const [importSummary, setImportSummary] = useState<{
    total: number;
    created: number;
    updated: number;
    invalid: number;
  }>();
  const importCounters = useRef({
    created: 0,
    updated: 0,
  });

  const storeFilter = [];

  const accountListHook = useApi<SettingsData<Account>>(
    Tables.accounts,
    storeFilter,
    ["code ASC"],
    0,
    25,
    ["parent", "group"],
  );

  const allAccountsHook = useApi<SettingsData<Account>>(
    Tables.accounts,
    storeFilter,
    ["code ASC"],
    0,
    9999,
    ["parent", "group"],
  );

  const accounts = allAccountsHook.data?.data || [];
  const columnHelper = createColumnHelper<Account>();
  const normalBalanceOptions = ["debit", "credit"];

  const parseBoolean = (value: string) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (["true", "1", "yes", "y", "active"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n", "inactive"].includes(normalized)) {
      return false;
    }

    throw new Error("Invalid is_active value. Use true/false, 1/0, yes/no.");
  };

  const columns = useMemo(() => [
    columnHelper.accessor("code", {
      header: t('columns.code'),
    }),
    columnHelper.accessor("name", {
      header: t('columns.name'),
    }),
    columnHelper.accessor("group", {
      header: t('columns.group'),
      enableSorting: false,
      cell: (info) => {
        const group = info.getValue();
        if (!group) {
          return "-";
        }
        return `${group.code} - ${group.name} (${group.head_type})`;
      },
    }),
    columnHelper.accessor("normal_balance", {
      header: t('columns.normal'),
      cell: (info) => info.getValue()?.toUpperCase?.() || "-",
    }),
    columnHelper.accessor("parent", {
      header: t('columns.parent'),
      enableSorting: false,
      cell: (info) => {
        const parent = info.getValue();
        if (!parent) {
          return "-";
        }
        return `${parent.code} - ${parent.name}`;
      }
    }),
    columnHelper.accessor("is_active", {
      header: t('columns.status'),
      cell: (info) => (
        <span className={info.getValue() ? "text-success-600" : "text-danger-600"}>
          {info.getValue() ? t('status.active') : t('status.inactive')}
        </span>
      ),
    }),
    columnHelper.accessor("id", {
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const current = info.row.original;
        return (
          <>
            <IconTooltipButton label={t('common:actions.edit')}
              type="button"
              variant="primary"
              className="w-[40px]"
              onClick={() => {
                setAccount(current);
                setOperation("update");
                setModal(true);
              }}
              tabIndex={-1}
            >
              <FontAwesomeIcon icon={faPencilAlt}/>
            </IconTooltipButton>
            <span className="mx-2 text-gray-300">|</span>
            <Switch
              checked={current.is_active}
              onChange={() => setActivateConfirm(current)}
            />
          </>
        );
      }
    })
  ], [columnHelper, t]);

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={accountListHook}
        loaderLineItems={6}
        buttons={[
          <Button
            key="import-account-csv"
            variant="success"
            onClick={() => {
              importCounters.current = {created: 0, updated: 0};
              setImportSummary(undefined);
              setCsvUploader(true);
            }}
          >
            <FontAwesomeIcon icon={faUpload} className="mr-2"/> {t('actions.importCsv')}
          </Button>,
          <Button
            key="create-account"
            variant="primary"
            onClick={() => {
              setAccount(undefined);
              setOperation("create");
              setModal(true);
            }}
          >
            <FontAwesomeIcon icon={faPlus} className="mr-2"/> {t('actions.account')}
          </Button>
        ]}
      />

      <DeleteConfirm
        open={activateConfirm != null}
        onOpenChange={(next) => {
          if (!next) setActivateConfirm(null);
        }}
        title={t('confirm.title')}
        message={activateConfirm
          ? t('confirm.activateAccount', {action: activateConfirm.is_active ? 'de-' : ''})
          : undefined}
        onConfirm={async () => {
          if (!activateConfirm) return;
          await db.merge(new StringRecordId(activateConfirm.id.toString()), {
            is_active: !activateConfirm.is_active,
          });
          await accountListHook.fetchData();
          await allAccountsHook.fetchData();
        }}
      />

      {importSummary && (
        <div className="mt-2 text-sm bg-primary-50 border border-primary-200 rounded px-3 py-2">
          {t('messages.importSummary', importSummary)}
        </div>
      )}

      {modal && (
        <CreateAccount
          addModal={modal}
          operation={operation}
          entity={account}
          allAccounts={accounts}
          onClose={async () => {
            setModal(false);
            setAccount(undefined);
            setOperation("create");
            await accountListHook.fetchData();
            await allAccountsHook.fetchData();
          }}
        />
      )}

      {csvUploader && (
        <CsvUploadModal
          isOpen={true}
          onClose={async () => {
            setCsvUploader(false);
            await accountListHook.fetchData();
            await allAccountsHook.fetchData();
          }}
          enableImportModes
          defaultMatchFields={['code']}
          fields={[
            {label: "code", name: "code"},
            {label: "name", name: "name"},
            {label: "group_code", name: "group_code"},
            {label: "normal_balance", name: "normal_balance"},
            {label: "parent_code", name: "parent_code"},
            {label: "is_active", name: "is_active"},
            {label: "notes", name: "notes"},
          ]}
          onImportRow={async (rowData, { mode, matchFields }) => {
            const requiredFields = ["code", "name", "group_code", "normal_balance", "parent_code", "is_active", "notes"];
            for (const field of requiredFields) {
              if (!(field in rowData)) {
                throw new Error(`Missing required column: ${field}`);
              }
            }

            const code = String(rowData.code || "").trim();
            const name = String(rowData.name || "").trim();
            const groupCode = String(rowData.group_code || "").trim();
            const normalBalance = String(rowData.normal_balance || "").trim().toLowerCase();
            const parentCode = String(rowData.parent_code || "").trim();
            const notes = String(rowData.notes || "").trim();
            const isActive = parseBoolean(rowData.is_active);

            if (!code || !name || !groupCode || !normalBalance) {
              throw new Error("code, name, group_code and normal_balance are required values.");
            }

            if (!normalBalanceOptions.includes(normalBalance)) {
              throw new Error("Invalid normal_balance. Use: debit or credit.");
            }

            const [groupRows] = await db.query(
              `SELECT id, head_type FROM ${Tables.account_groups} WHERE code = $code LIMIT 1`,
              {
                code: groupCode,
              }
            );

            if (!groupRows || groupRows.length === 0) {
              throw new Error(`Account group not found for group_code: ${groupCode}`);
            }

            let parentId: any = null;
            if (parentCode) {
              const [parentRows] = await db.query(
                `SELECT id FROM ${Tables.accounts} WHERE code = $code LIMIT 1`,
                {
                  code: parentCode,
                }
              );

              if (!parentRows || parentRows.length === 0) {
                throw new Error(`Parent account not found for parent_code: ${parentCode}`);
              }

              parentId = toRecordId(parentRows[0].id);
            }

            const payload: any = {
              code,
              name,
              group: toRecordId(groupRows[0].id),
              account_type: groupRows[0].head_type,
              normal_balance: normalBalance,
              parent: parentId,
              notes: notes || null,
              is_active: isActive,
            };

            assertCsvMatchValues(rowData, matchFields, (field) =>
              t('common:csvImport.emptyMatchValue', { field })
            );

            const unsupported = ['group_code', 'parent_code'];
            const conditions = buildMatchConditions(rowData, matchFields, (field, value) => {
              if (unsupported.includes(field)) {
                throw new Error(t('common:csvImport.unsupportedMatchField', { field }));
              }
              if (field === 'is_active') {
                return { column: 'is_active', value: parseBoolean(value) };
              }
              if (field === 'normal_balance') {
                return { column: 'normal_balance', value: value.toLowerCase() };
              }
              return { column: field, value };
            });

            const existing = mode === 'create'
              ? []
              : await findCsvImportMatches(db, Tables.accounts, conditions, { softDelete: false });

            const result = await writeCsvImportRow(db, {
              mode,
              table: Tables.accounts,
              existing,
              payload,
              notFoundMessage: t('common:csvImport.recordNotFound'),
              multipleMatchesMessage: t('common:csvImport.multipleMatches'),
            });

            if (result === 'updated') {
              importCounters.current.updated += 1;
            } else {
              importCounters.current.created += 1;
            }
          }}
          onDone={(data) => {
            const created = importCounters.current.created;
            const updated = importCounters.current.updated;
            const invalid = Math.max(data.total - created - updated, 0);
            setImportSummary({
              total: data.total,
              created,
              updated,
              invalid,
            });
            toast.success(t('messages.importComplete', {created, updated, invalid}));
            importCounters.current = { created: 0, updated: 0 };
          }}
          onExport={async () => {
            const list = accounts.length > 0
              ? accounts
              : (allAccountsHook.data?.data || []);
            return list.map((a) => ({
              code: a.code ?? '',
              name: a.name ?? '',
              group_code: a.group?.code ?? '',
              normal_balance: a.normal_balance ?? '',
              parent_code: a.parent?.code ?? '',
              is_active: a.is_active ? 'true' : 'false',
              notes: a.notes ?? '',
            }));
          }}
        />
      )}
    </>
  );
};
