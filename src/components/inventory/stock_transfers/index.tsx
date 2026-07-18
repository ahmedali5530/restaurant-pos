import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import {StockTransfer} from "@/api/model/stock_transfer.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faFile, faPencil, faPlus, faPrint} from "@fortawesome/free-solid-svg-icons";
import {StockTransferForm} from "@/components/inventory/stock_transfers/form.tsx";
import {StockTransferViewModal} from "@/components/inventory/stock_transfers/view.modal.tsx";
import {InventoryDocumentPrintModal} from "@/components/inventory/common/document.print.modal.tsx";
import {InventoryInvoiceDoc, mapStockTransferToInvoice} from "@/lib/inventory/invoice.mapper.ts";
import {useStockTransferList} from "@/hooks/useStockTransferList.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {useInventoryLocations} from "@/hooks/useInventoryLocations.ts";

export const InventoryStockTransfers = () => {
  const {t} = useTranslation("inventory");
  const {protectAction} = useSecurity();
  const loadHook = useStockTransferList(0, 10);

  const {options: locationOptions} = useInventoryLocations(true);

  const [data, setData] = useState<StockTransfer>();
  const [formModal, setFormModal] = useState(false);
  const [viewTransfer, setViewTransfer] = useState<StockTransfer | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [printDoc, setPrintDoc] = useState<InventoryInvoiceDoc | null>(null);
  const [filterLocation, setFilterLocation] = useState<{label: string; value: string} | null>(null);

  const applyFilters = () => {
    loadHook.setListFilters({
      locationId: filterLocation?.value,
    });
    loadHook.handlePageChange(0);
    loadHook.fetchData();
  };

  const clearFilters = () => {
    setFilterLocation(null);
    loadHook.resetFilters();
    loadHook.fetchData();
  };

  const columnHelper = createColumnHelper<StockTransfer>();

  const columns: any = [
    columnHelper.accessor("created_at", {
      header: t("columns.createdAt"),
      cell: (info) =>
        info.getValue() ? toJsDate(info.getValue() as any).toLocaleString() : "",
    }),
    columnHelper.accessor(
      (row) => {
        const from =
          row.from_location?.name ?? row.from_store?.name ?? "—";
        const to = row.to_location?.name ?? row.to_store?.name ?? "—";
        return `${from} → ${to}`;
      },
      {
        id: "route",
        header: t("stockTransfer.route"),
      }
    ),
    columnHelper.accessor((row) => row.created_by?.first_name ?? "", {
      id: "created_by",
      header: t("columns.createdBy"),
      cell: (info) => {
        const row = info.row.original;
        return `${row.created_by?.first_name ?? ""} ${row.created_by?.last_name ?? ""}`.trim();
      },
    }),
    columnHelper.accessor("items", {
      header: t("tabs.items"),
      cell: (info) => (
        <div className="flex flex-wrap gap-2">
          {info.getValue()?.slice(0, 5)?.map((item, index) => (
            <span key={item.id ?? index} className="tag">
              {item.item?.name}-{item.item?.code} × {item.quantity}
            </span>
          ))}
        </div>
      ),
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            iconButton
            onClick={() => {
              setViewTransfer(info.row.original);
              setViewModalOpen(true);
            }}
          >
            <FontAwesomeIcon icon={faFile} />
          </Button>
          <Button
            variant="secondary"
            iconButton
            title={t("print.printReceipt")}
            onClick={() => setPrintDoc(mapStockTransferToInvoice(info.row.original))}
          >
            <FontAwesomeIcon icon={faPrint} />
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              protectAction(() => {
                setData(info.row.original);
                setFormModal(true);
              }, {
                module: "Edit Stock Transfers",
                description: t("security.editStockTransfers"),
              });
            }}
          >
            <FontAwesomeIcon icon={faPencil} />
          </Button>
        </div>
      ),
    }),
  ];

  return (
    <>
      <div className="flex flex-wrap gap-3 items-end px-4 py-3 border-b border-neutral-200">
        <div className="w-56">
          <label className="text-sm text-neutral-600">{t("stockTransfer.filterStore")}</label>
          <ReactSelect
            value={filterLocation}
            onChange={setFilterLocation}
            options={locationOptions}
            isClearable
          />
        </div>
        <Button variant="primary" onClick={applyFilters}>
          {t("stockTransfer.applyFilters")}
        </Button>
        <Button variant="secondary" onClick={clearFilters}>
          {t("stockTransfer.clearFilters")}
        </Button>
      </div>

      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        enableSearch={false}
        buttons={[
          <Button
            key="transfer-create"
            variant="primary"
            onClick={() => {
              setData(undefined);
              setFormModal(true);
            }}
            icon={faPlus}
          >
            {t("stockTransfer.create")}
          </Button>,
        ]}
      />

      {formModal && (
        <StockTransferForm
          open
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}

      {viewModalOpen && (
        <StockTransferViewModal
          open={viewModalOpen}
          transfer={viewTransfer}
          onClose={() => {
            setViewModalOpen(false);
            setViewTransfer(null);
          }}
        />
      )}

      <InventoryDocumentPrintModal
        open={!!printDoc}
        doc={printDoc}
        onClose={() => setPrintDoc(null)}
      />
    </>
  );
};
