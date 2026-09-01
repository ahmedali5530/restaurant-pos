import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryWaste} from "@/api/model/inventory_waste.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faFile, faPencil, faPlus, faPrint} from "@fortawesome/free-solid-svg-icons";
import {InventoryWasteForm} from "@/components/inventory/wastes/form.tsx";
import {useDB} from "@/api/db/db.ts";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {InventoryWasteViewModal} from "@/components/inventory/wastes/view.modal.tsx";
import {inventoryPrintUrl} from "@/routes/posr.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {formatDateTime} from "@/lib/datetime.ts";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { wasteListTotal } from "@/lib/inventory/document.list.total.ts";
import { withCurrency } from "@/lib/utils.ts";

export const InventoryWastes = () => {
  const { t } = useTranslation(['inventory', 'common']);
  const loadHook = useApi<SettingsData<InventoryWaste>>(
    Tables.inventory_wastes,
    [],
    ["created_at DESC"],
    0,
    10,
    ["purchase", "issue", "items", "items.item", "items.location", "items.purchase_item", "items.purchase_item.location", "items.issue_item", "items.issue_item.location", "created_by"]
  );
  const db = useDB();
  const { protectAction } = useSecurity();

  const [data, setData] = useState<InventoryWaste>();
  const [formModal, setFormModal] = useState(false);
  const [viewWaste, setViewWaste] = useState<InventoryWaste | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);

  const columnHelper = createColumnHelper<InventoryWaste>();

  const columns: any = [
    columnHelper.accessor("invoice_number", {
      header: t('columns.invoiceNumber')
    }),
    columnHelper.accessor(row => {
      const loc = row.items?.find((item) => item.location)?.location
        ?? row.items?.find((item) => item.purchase_item?.location)?.purchase_item?.location
        ?? row.items?.find((item) => item.issue_item?.location)?.issue_item?.location;
      if (loc?.name) return loc.name;
      if (row.purchase) return `Purchase #${row.purchase.invoice_number}`;
      if (row.issue) return `Issue #${row.issue.invoice_number ?? row.issue.id}`;
      return "";
    }, {
      id: "location",
      header: t('columns.location'),
      cell: info => info.getValue() || "—",
    }),
    columnHelper.accessor("created_at", {
      header: t('columns.createdAt'),
      cell: info => info.getValue() ? formatDateTime(info.getValue() as any) : ""
    }),
    columnHelper.accessor("items", {
      header: t('tabs.items'),
      cell: info => (
        <div className="flex flex-wrap gap-2">
          {info.getValue()?.map((item, index) => (
            <span key={item.id ?? index} className="tag">
              {item.item?.name ?? "Unknown"} × {item.quantity}
            </span>
          ))}
        </div>
      )
    }),
    columnHelper.accessor(row => wasteListTotal(row.items), {
      id: "total",
      header: t('columns.total'),
      cell: info => withCurrency(info.getValue()),
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <div className="flex gap-3">
            <IconTooltipButton label={t('common:actions.view')}
              variant="secondary"
             
              onClick={() => {
                setViewWaste(info.row.original);
                setViewModalOpen(true);
              }}
            >
              <FontAwesomeIcon icon={faFile}/>
            </IconTooltipButton>
            <IconTooltipButton label={t('print.printReceipt')}
              variant="secondary"
             
             
              onClick={() => window.open(inventoryPrintUrl("waste", String(info.row.original.id)), "_blank")}
            >
              <FontAwesomeIcon icon={faPrint}/>
            </IconTooltipButton>
            <IconTooltipButton label={t('common:actions.edit')}
              variant="primary"
              onClick={() => {
                protectAction(() => {
                  setData(info.row.original);
                  setFormModal(true);
                }, {
                  module: 'inventory.wastes.update',
                  description: t('security.editWastes'),
                });
              }}
            >
              <FontAwesomeIcon icon={faPencil}/>
            </IconTooltipButton>

            <DeleteConfirm onConfirm={() =>
              protectAction(async () => {
                await db.delete(info.getValue());
                await db.query(`DELETE
                                FROM ${Tables.inventory_waste_items}
                                where waste = $waste`, {
                  waste: info.getValue()
                });

                loadHook.fetchData();
              }, {
                module: 'inventory.wastes.delete',
                description: t('security.deleteWastes'),
              })
            }/>
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
            key="waste-create"
            variant="primary"
            onClick={() => {
              setFormModal(true);
            }}
            icon={faPlus}
          >
            Waste
          </Button>
        ]}
        defaultSort={[
          {id: 'invoice_number', desc: true}
        ]}
      />

      {formModal && (
        <InventoryWasteForm
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
        <InventoryWasteViewModal
          open={viewModalOpen}
          waste={viewWaste}
          onClose={() => {
            setViewModalOpen(false);
            setViewWaste(null);
          }}
        />
      )}
    </>
  );
};

