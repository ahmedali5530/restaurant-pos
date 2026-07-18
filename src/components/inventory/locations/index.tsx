import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createColumnHelper } from "@tanstack/react-table";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { InventoryLocation } from "@/api/model/inventory_location.ts";
import { TableComponent } from "@/components/common/table/table.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus, faSync } from "@fortawesome/free-solid-svg-icons";
import { useDB } from "@/api/db/db.ts";
import { syncAllInventoryLocations } from "@/lib/inventory/location.service.ts";
import { toast } from "sonner";
import { recordIdToString } from "@/api/reports/shared/records.ts";
import { InventoryLocationForm } from "@/components/inventory/locations/form.tsx";

export const InventoryLocations = () => {
  const { t } = useTranslation("inventory");
  const db = useDB();
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState<InventoryLocation>();
  const [formModal, setFormModal] = useState(false);

  const loadHook = useApi<SettingsData<InventoryLocation>>(
    Tables.inventory_locations,
    [],
    ["name ASC"],
    0,
    20,
    ["linked_store", "linked_kitchen"]
  );

  const columnHelper = createColumnHelper<InventoryLocation>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: t("columns.name"),
    }),
    columnHelper.accessor("type", {
      header: t("columns.locationType"),
      cell: (info) => {
        const value = String(info.getValue() ?? "");
        return t(`location.types.${value}`, { defaultValue: value });
      },
    }),
    columnHelper.accessor((row) => row.linked_kitchen, {
      id: "linked_kitchen",
      header: t("columns.linkedKitchen"),
      cell: (info) => {
        const kitchen = info.getValue() as { name?: string; id?: string } | string | undefined;
        if (!kitchen) return "—";
        if (typeof kitchen === "string") return recordIdToString(kitchen);
        return kitchen.name || recordIdToString(kitchen.id) || "—";
      },
    }),
    columnHelper.accessor("is_active", {
      header: t("columns.active"),
      cell: (info) =>
        info.getValue() === false ? t("location.inactive") : t("location.active"),
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => (
        <Button
          variant="primary"
          onClick={() => {
            setData(info.row.original);
            setFormModal(true);
          }}
        >
          <FontAwesomeIcon icon={faPencil} />
        </Button>
      ),
    }),
  ];

  const handleSync = async () => {
    try {
      setSyncing(true);
      const result = await syncAllInventoryLocations(db);
      toast.success(
        t("location.synced", {
          stores: result.stores,
          kitchens: result.kitchens,
        })
      );
      loadHook.fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        buttons={[
          <Button
            key="location-create"
            variant="primary"
            icon={faPlus}
            onClick={() => {
              setData(undefined);
              setFormModal(true);
            }}
          >
            {t("location.create")}
          </Button>,
          <Button
            key="location-sync"
            variant="secondary"
            icon={faSync}
            disabled={syncing}
            onClick={() => void handleSync()}
          >
            {syncing ? t("location.syncing") : t("location.sync")}
          </Button>,
        ]}
      />

      {formModal && (
        <InventoryLocationForm
          open={true}
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
