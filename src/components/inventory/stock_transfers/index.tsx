import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {StockTransfer} from "@/api/model/stock_transfer.ts";
import {Kitchen} from "@/api/model/kitchen.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faFile, faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {StockTransferForm} from "@/components/inventory/stock_transfers/form.tsx";
import {StockTransferViewModal} from "@/components/inventory/stock_transfers/view.modal.tsx";
import {useStockTransferList} from "@/hooks/useStockTransferList.ts";
import {inferTransferType} from "@/lib/inventory/stock_transfer.service.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import classNames from "classnames";

const toRecordIdString = (id: unknown): string => {
  if (!id) return "";
  if (typeof id === "string") return id;
  if (typeof id === "object" && id !== null && "toString" in id) {
    return (id as {toString(): string}).toString();
  }
  return String(id);
};

export const InventoryStockTransfers = () => {
  const {t} = useTranslation("inventory");
  const loadHook = useStockTransferList(0, 10);

  const {data: kitchens, fetchData: fetchKitchens} = useApi<SettingsData<Kitchen>>(
    Tables.kitchens,
    ["deleted_at = none"],
    [],
    0,
    9999,
    [],
    {enabled: false}
  );

  const {data: stores, fetchData: fetchStores} = useApi<SettingsData<InventoryStore>>(
    Tables.inventory_stores,
    [],
    [],
    0,
    9999,
    [],
    {enabled: false}
  );

  const [data, setData] = useState<StockTransfer>();
  const [formModal, setFormModal] = useState(false);
  const [viewTransfer, setViewTransfer] = useState<StockTransfer | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [filterKitchen, setFilterKitchen] = useState<{label: string; value: string} | null>(null);
  const [filterStore, setFilterStore] = useState<{label: string; value: string} | null>(null);

  useEffect(() => {
    fetchKitchens();
    fetchStores();
  }, [fetchKitchens, fetchStores]);

  const kitchenOptions = useMemo(
    () =>
      kitchens?.data?.map((kitchen) => ({
        label: kitchen.name,
        value: toRecordIdString(kitchen.id),
      })) ?? [],
    [kitchens]
  );

  const storeOptions = useMemo(
    () =>
      stores?.data?.map((store) => ({
        label: store.name,
        value: toRecordIdString(store.id),
      })) ?? [],
    [stores]
  );

  const applyFilters = () => {
    loadHook.setListFilters({
      kitchenId: filterKitchen?.value,
      storeId: filterStore?.value,
    });
    loadHook.handlePageChange(0);
    loadHook.fetchData();
  };

  const clearFilters = () => {
    setFilterKitchen(null);
    setFilterStore(null);
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
    columnHelper.accessor((row) => inferTransferType(row), {
      id: "type",
      header: t("stockTransfer.type"),
      cell: (info) => {
        const type = info.getValue();
        return (
          <span
            className={classNames(
              "tag",
              type === "kitchen" ? "bg-info-100 text-info-800" : "bg-neutral-100 text-neutral-800"
            )}
          >
            {type === "kitchen"
              ? t("stockTransfer.typeKitchen")
              : t("stockTransfer.typeStore")}
          </span>
        );
      },
    }),
    columnHelper.accessor(
      (row) => {
        const type = inferTransferType(row);
        if (type === "kitchen") {
          return `${row.from_kitchen?.name ?? "—"} → ${row.to_kitchen?.name ?? "—"}`;
        }
        return `${row.from_store?.name ?? "—"} → ${row.to_store?.name ?? "—"}`;
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
            variant="primary"
            onClick={() => {
              setData(info.row.original);
              setFormModal(true);
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
          <label className="text-sm text-neutral-600">{t("stockTransfer.filterKitchen")}</label>
          <ReactSelect
            value={filterKitchen}
            onChange={setFilterKitchen}
            options={kitchenOptions}
            isClearable
          />
        </div>
        <div className="w-56">
          <label className="text-sm text-neutral-600">{t("stockTransfer.filterStore")}</label>
          <ReactSelect
            value={filterStore}
            onChange={setFilterStore}
            options={storeOptions}
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
    </>
  );
};
