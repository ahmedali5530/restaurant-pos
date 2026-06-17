import { useState } from "react";
import { Menu } from "@/api/model/menu.ts";
import { Tables } from "@/api/db/tables.ts";
import { Button } from "@/components/common/input/button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus, faList, faCheck, faTimes } from "@fortawesome/free-solid-svg-icons";
import { createColumnHelper } from "@tanstack/react-table";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { TableComponent } from "@/components/common/table/table.tsx";
import { MenuForm } from "@/components/settings/menu/menu.form.tsx";
import { MenuItems } from "@/components/settings/menu/menu.items.tsx";
import { toJsDate } from "@/lib/datetime.ts";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";

export const AdminMenus = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<Menu>>(Tables.menus, ['deleted_at = none'], [], 0, 10, ['items', 'items.menu_item', 'items.tax']);
  const db = useDB();

  const [data, setData] = useState<Menu>();
  const [formModal, setFormModal] = useState(false);
  const [itemsModal, setItemsModal] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState<Menu>();

  const columnHelper = createColumnHelper<Menu>();

  // Helper function to format Date to time string (HH:mm)
  const formatTime = (date: unknown): string => {
    if (!date) return '-';
    const dateObj = toJsDate(date as any);
    if (isNaN(dateObj.getTime())) return '-';
    const hours = dateObj.getHours().toString().padStart(2, '0');
    const minutes = dateObj.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const columns: any = [
    columnHelper.accessor("name", {
      header: t('columns.name')
    }),
    columnHelper.accessor("start_from", {
      header: t('columns.startTime'),
      cell: info => formatTime(info.getValue())
    }),
    columnHelper.accessor("end_time", {
      header: t('columns.endTime'),
      cell: info => formatTime(info.getValue())
    }),
    columnHelper.accessor("ends_on_next_day", {
      header: t('columns.endsNextDay'),
      cell: info => info.getValue() ? t('columns.yes') : t('columns.no')
    }),
    columnHelper.accessor("active", {
      header: t('columns.active'),
      cell: info => info.getValue() !== false ? <FontAwesomeIcon icon={faCheck} className="text-success-500" /> : <FontAwesomeIcon icon={faTimes} className="text-danger-500" />
    }),
    columnHelper.accessor("items", {
      header: t('columns.itemsCount'),
      cell: info => {
        const inactiveItems = info.getValue()?.filter(item => item.active === true)?.length || 0;
        const total = info.getValue()?.length || 0;
        return (
          <>
            {inactiveItems !== total ? `${inactiveItems}/` : ''}
            {total}
          </>
        )
      }
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <div className="flex gap-3 items-center">
            <Button
              variant="primary"
              onClick={() => {
                setData(info.row.original);
                setFormModal(true);
              }}
            ><FontAwesomeIcon icon={faPencil}/></Button>
            <div className="separator"></div>
            <Button
              variant="primary"
              onClick={() => {
                setSelectedMenu(info.row.original);
                setItemsModal(true);
              }}
            ><FontAwesomeIcon icon={faList}/></Button>
            <div className="separator"></div>
            <DeleteConfirm
              message={t('delete.menu', { name: info.row.original.name })}
              onConfirm={() => deleteItem(info.row.original.id)}
            />
          </div>
        );
      },
    }),
  ];

  const deleteItem = async (id: string) => {
    await executeSettingsDelete({
      db,
      id,
      entityLabel: t('entities.menu'),
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.settings} WHERE key = 'delivery_menu' AND value = $idRecord GROUP ALL`
        }
      ],
      cleanupQueries: [
        {
          query: `DELETE (SELECT VALUE items FROM ONLY $idRecord)`
        }
      ],
      onAfter: async () => {
        loadHook.fetchData();
      }
    });
  };

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        buttons={[
          <Button variant="primary" onClick={() => {
            setFormModal(true);
          }} icon={faPlus}>{t('buttons.menu')}</Button>
        ]}
      />

      {formModal && (
        <MenuForm
          open={formModal}
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}

      {itemsModal && (
        <MenuItems
          open={true}
          menu={selectedMenu}
          onClose={() => {
            setItemsModal(false);
            setSelectedMenu(undefined);
            loadHook.fetchData();
          }}
        />
      )}
    </>
  )
}

