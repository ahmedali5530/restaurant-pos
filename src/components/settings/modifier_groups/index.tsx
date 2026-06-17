import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/common/input/button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import { TableComponent } from "@/components/common/table/table.tsx";
import { ModifierGroup } from "@/api/model/modifier_group.ts";
import { ModifierGroupForm } from "@/components/settings/modifier_groups/modifier_group.form.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";

export const AdminModifierGroups = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<ModifierGroup>>(Tables.modifier_groups, ['deleted_at = none'], ['priority asc'], 0, 10, ['modifiers', 'modifiers.modifier', 'modifiers.allowed_next_groups', 'modifiers.next_group_overrides']);
  const db = useDB();

  const [data, setData] = useState<ModifierGroup>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<ModifierGroup>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: t('columns.name')
    }),
    columnHelper.accessor("modifiers", {
      header: t('columns.modifiers'),
      cell: info => <div className="flex gap-2 flex-wrap">
        {info.getValue()?.map((item, index) => (
          <span className="tag" key={`${item.id}-${index}`}>
            {item.modifier.name} — {item.price}
            {item.allowed_next_groups != null && item.allowed_next_groups.length > 0 && (
              <span className="text-neutral-500"> ({t('columns.nextCount', { count: item.allowed_next_groups.length })})</span>
            )}
          </span>
        ))}
      </div>,
      enableSorting: false
    }),
    columnHelper.accessor("priority", {
      header: t('columns.priority')
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
            <DeleteConfirm
              message={t('delete.dish', { name: info.row.original.name })}
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
      entityLabel: t('entities.modifierGroup'),
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.dish_modifier_groups} WHERE out = $idRecord GROUP ALL`
        },
        {
          query: `SELECT count() AS count FROM ${Tables.order_items} WHERE array::any(modifiers.id ?? [], $idRecord) GROUP ALL`
        }
      ],
      cleanupQueries: [
        {
          query: `DELETE ${Tables.dish_modifier_groups} WHERE out = $idRecord`
        }
      ],
      onAfter: async () => {
        loadHook.fetchData();
      }
    });
  }

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        buttons={[
          <Button variant="primary" onClick={() => {
            setFormModal(true);
          }} icon={faPlus}>{t('buttons.modifierGroup')}</Button>
        ]}
      />

      {/*{formModal && (*/}
        <ModifierGroupForm
          open={formModal}
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      {/*)}*/}
    </>
  )
}
