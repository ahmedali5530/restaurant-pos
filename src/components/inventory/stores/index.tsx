import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {InventoryStoreForm} from "@/components/inventory/stores/form.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";

export const InventoryStores = () => {
  const { t } = useTranslation(['inventory', 'common']);
  const loadHook = useApi<SettingsData<InventoryStore>>(Tables.inventory_stores, [], [], 0, 10, []);

  const [data, setData] = useState<InventoryStore>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<InventoryStore>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: t('columns.name')
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <IconTooltipButton label={t('common:actions.edit')}
            variant="primary"
            onClick={() => {
              setData(info.row.original);
              setFormModal(true);
            }}
          >
            <FontAwesomeIcon icon={faPencil}/>
          </IconTooltipButton>
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
            key="store-create"
            variant="primary"
            onClick={() => {
              setFormModal(true);
            }}
            icon={faPlus}
          >
            Store
          </Button>
        ]}
      />

      {formModal && (
        <InventoryStoreForm
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

