import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryIssueReturn} from "@/api/model/inventory_issue_return.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faFile, faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {InventoryIssueReturnForm} from "@/components/inventory/issue_returns/form.tsx";
import {InventoryIssueReturnViewModal} from "@/components/inventory/issue_returns/view.modal.tsx";
import { toJsDate } from "@/lib/datetime.ts";

export const InventoryIssueReturns = () => {
  const { t } = useTranslation('inventory');
  const loadHook = useApi<SettingsData<InventoryIssueReturn>>(
    Tables.inventory_issue_returns,
    [],
    ["created_at DESC"],
    0,
    10,
    ["issuance", "issuance.items", "issuance.items.item", "issued_to", "kitchen", "items", "items.item", "items.issued_item"]
  );

  const [data, setData] = useState<InventoryIssueReturn>();
  const [formModal, setFormModal] = useState(false);
  const [viewIssueReturn, setViewIssueReturn] = useState<InventoryIssueReturn | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);

  const columnHelper = createColumnHelper<InventoryIssueReturn>();

  const columns: any = [
    columnHelper.accessor(row => row.issuance?.invoice_number ?? "", {
      id: "invoice_number",
      header: t('columns.returnNumber')
    }),
    columnHelper.accessor(row => row.issuance?.invoice_number ?? "", {
      id: "issuance",
      header: t('columns.issuance')
    }),
    columnHelper.accessor("created_at", {
      header: t('columns.createdAt'),
      cell: info => info.getValue() ? toJsDate(info.getValue() as any).toLocaleString() : ""
    }),
    columnHelper.accessor('issued_to', {
      id: "issued_to",
      header: t('columns.issuedTo'),
      cell: info => `${info.getValue()?.first_name} ${info.getValue()?.last_name}`
    }),
    columnHelper.accessor(row => row.kitchen?.name ?? "", {
      id: "kitchen",
      header: t('columns.kitchen')
    }),
    columnHelper.accessor("items", {
      header: t('tabs.items'),
      cell: info => (
        <div className="flex flex-wrap gap-2">
          {info.getValue()?.slice(0, 5)?.map((item, index) => (
            <span key={item.id ?? index} className="tag">
              {item.item?.name}-{item.item?.code} × {item.quantity}
            </span>
          ))}
        </div>
      )
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              iconButton
              onClick={() => {
                setViewIssueReturn(info.row.original);
                setViewModalOpen(true);
              }}
            >
              <FontAwesomeIcon icon={faFile}/>
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setData(info.row.original);
                setFormModal(true);
              }}
            >
              <FontAwesomeIcon icon={faPencil}/>
            </Button>
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
          <Button
            key="issue-return-create"
            variant="primary"
            onClick={() => {
              setFormModal(true);
            }}
            icon={faPlus}
          >
            Issue return
          </Button>
        ]}
      />

      {formModal && (
        <InventoryIssueReturnForm
          open={true}
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}

      {viewModalOpen && (
        <InventoryIssueReturnViewModal
          open={viewModalOpen}
          issueReturn={viewIssueReturn}
          onClose={() => {
            setViewModalOpen(false);
            setViewIssueReturn(null);
          }}
        />
      )}
    </>
  );
};

