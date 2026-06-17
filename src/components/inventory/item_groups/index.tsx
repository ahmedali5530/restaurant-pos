import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryItemGroup} from "@/api/model/inventory_item_group.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {InventoryItemGroupForm} from "@/components/inventory/item_groups/form.tsx";

export const InventoryItemGroups = () => {
  const { t } = useTranslation('inventory');
  const loadHook = useApi<SettingsData<InventoryItemGroup>>(Tables.inventory_item_groups, [], [], 0, 10, ['main_item', 'sub_items', 'sub_items.item']);

  const [data, setData] = useState<InventoryItemGroup>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<InventoryItemGroup>();

  const columns: any = [
    columnHelper.accessor('main_item', {
      id: "main_item",
      header: t('columns.mainItem'),
      cell: info => `${info.getValue().name}-${info.getValue().code}`
    }),
    columnHelper.accessor("base_quantity", {
      header: t('columns.baseQuantity'),
    }),
    columnHelper.accessor("sub_items", {
      header: t('columns.subItems'),
      cell: info => (
        <div className="flex flex-wrap gap-2">
          {info.getValue().slice(0, 5)?.map((item, index) => (
            <span key={item.id ?? index} className="tag">
              {item.item?.name}-{item.item?.code} &times; {item.quantity}
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
          <Button
            variant="primary"
            onClick={() => {
              setData(info.row.original);
              setFormModal(true);
            }}
          >
            <FontAwesomeIcon icon={faPencil}/>
          </Button>
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
            key="item-group-create"
            variant="primary"
            onClick={() => {
              setFormModal(true);
            }}
            icon={faPlus}
          >
            Item group
          </Button>
        ]}
      />

      {formModal && (
        <InventoryItemGroupForm
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

