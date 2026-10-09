import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import {toast} from "sonner";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {EmployeeDocument} from "@/api/model/employee_document.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {IconTooltipButton} from "@/components/common/input/icon.tooltip.button.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {faEye, faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {DocumentForm} from "@/components/hr/documents/form.tsx";
import {entityLabel, formatDisplayDate} from "@/components/hr/shared/form.utils.ts";
import {viewArrayBufferInNewTab} from "@/utils/files.ts";
import {toRecordId} from "@/lib/utils.ts";

export const HrDocuments = () => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const loadHook = useApi<SettingsData<EmployeeDocument>>(
    Tables.employee_documents,
    [],
    ["uploaded_at DESC"],
    0,
    10,
    ["employee", "document", "uploaded_by"],
  );

  const [data, setData] = useState<EmployeeDocument>();
  const [formModal, setFormModal] = useState(false);

  const handleDelete = async (row: EmployeeDocument) => {
    try {
      await db.delete(toRecordId(row.id));
      if (row.document?.id) {
        await db.delete(toRecordId(row.document.id));
      }
      toast.success(t("toast.documentDeleted", {defaultValue: "Document deleted"}));
      loadHook.fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const columnHelper = createColumnHelper<EmployeeDocument>();

  const columns: any = [
    columnHelper.accessor((row) => entityLabel(row.employee), {
      id: "employee",
      header: t("columns.employee"),
      meta: {filterField: "string::concat(employee.first_name, ' ', employee.last_name ?? '')"},
    }),
    columnHelper.accessor("title", {header: t("columns.title")}),
    columnHelper.accessor("category", {
      header: t("columns.category"),
      cell: (info) => {
        const value = info.getValue();
        if (!value) return "";
        const key = value === "id_document" ? "idDocument" : value;
        return t(`documentCategories.${key}`, {defaultValue: value});
      },
    }),
    columnHelper.accessor("expires_at", {
      header: t("columns.expiresAt"),
      cell: (info) => formatDisplayDate(info.getValue()),
    }),
    columnHelper.accessor("uploaded_at", {
      header: t("columns.uploadedAt"),
      cell: (info) => formatDisplayDate(info.getValue()),
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const row = info.row.original;
        const doc = row.document;
        return (
          <div className="flex gap-2 items-center">
            <IconTooltipButton
              label={t("buttons.view", {defaultValue: "View"})}
              variant="neutral"
              icon={faEye}
              disabled={!doc?.content}
              onClick={() => {
                if (!doc?.content) return;
                viewArrayBufferInNewTab(doc.content, doc.type ?? "application/octet-stream");
              }}
            />
            <IconTooltipButton
              label={t("buttons.edit")}
              variant="primary"
              icon={faPencil}
              onClick={() => { setData(row); setFormModal(true); }}
            />
            <DeleteConfirm
              message={t("forms.document.deleteConfirm", {
                defaultValue: "Delete this document? This cannot be undone.",
              })}
              onConfirm={() => handleDelete(row)}
            />
          </div>
        );
      },
    }),
  ];

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        buttons={[
          <Button key="document-create" variant="primary" data-testid="hr-add-documents" onClick={() => { setData(undefined); setFormModal(true); }} icon={faPlus}>
            {t("buttons.document")}
          </Button>,
        ]}
      />
      {formModal && (
        <DocumentForm
          open
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}
    </>
  );
};
