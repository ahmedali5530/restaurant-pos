import {useState} from "react";
import {Tables} from "@/api/db/tables.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {createColumnHelper} from "@tanstack/react-table";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Discount, DiscountType} from "@/api/model/discount.ts";
import {DiscountForm} from "@/components/settings/discounts/discount.form.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";
import {TabList, Tabs} from "react-aria-components";
import {Tab, TabPanel} from "@/components/common/react-aria/tabs";
import {DiscountPermissionMatrix} from "@/components/settings/discounts/permission-matrix.tsx";
import {DiscountReasonsAdmin} from "@/components/settings/discounts/reasons/index.tsx";

export const AdminDiscounts = () => {
  const {t} = useTranslation(['admin', 'common', 'toast', 'payment']);
  const loadHook = useApi<SettingsData<Discount>>(Tables.discounts, ['deleted_at = none']);
  const db = useDB();

  const [data, setData] = useState<Discount>();
  const [formModal, setFormModal] = useState(false);
  const [tab, setTab] = useState('rules');

  const columnHelper = createColumnHelper<Discount>();

  const translateCategory = (value?: string) => {
    const key = value || 'manual';
    return t(`discountEngine.categories.${key}`, {defaultValue: key});
  };

  const translateScope = (value?: string) => {
    const key = value || 'cart';
    return t(`discountEngine.scopes.${key}`, {defaultValue: key});
  };

  const translateMode = (value?: string) => {
    const key = value || 'manual';
    return t(`discountEngine.applicationModes.${key}`, {defaultValue: key});
  };

  const translateType = (value?: string) => {
    if (value === DiscountType.Fixed) {
      return t('payment:discountType.fixed');
    }
    return t('payment:discountType.percent');
  };

  const columns: any = [
    columnHelper.accessor("name", {header: t('columns.name')}),
    columnHelper.accessor("category", {
      header: t('discountEngine.columns.category'),
      cell: info => translateCategory(info.getValue()),
    }),
    columnHelper.accessor("scope", {
      header: t('discountEngine.columns.scope'),
      cell: info => translateScope(info.getValue()),
    }),
    columnHelper.accessor("application_mode", {
      header: t('discountEngine.columns.mode'),
      cell: info => translateMode(info.getValue()),
    }),
    columnHelper.accessor("type", {
      header: t('columns.type'),
      cell: info => translateType(info.getValue()),
    }),
    columnHelper.accessor("priority", {header: t('columns.priority')}),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => (
        <div className="flex gap-3 items-center">
          <Button variant="primary" onClick={() => {
            setData(info.row.original);
            setFormModal(true);
          }}><FontAwesomeIcon icon={faPencil}/></Button>
          <DeleteConfirm
            message={t('delete.discount', {name: info.row.original.name})}
            onConfirm={() => deleteItem(info.row.original.id)}
          />
        </div>
      ),
    }),
  ];

  const deleteItem = async (id: string) => {
    await executeSettingsDelete({
      db,
      id,
      entityLabel: t('entities.discount'),
      usageChecks: [
        {
          query: `SELECT count() AS count
                  FROM ${Tables.payment_types}
                  WHERE discounts ?= $idRecord
                  GROUP ALL`
        },
        {
          query: `SELECT count() AS count
                  FROM ${Tables.orders}
                  WHERE discount = $idRecord
                  GROUP ALL`
        }
      ],
      onAfter: async () => {
        loadHook.fetchData();
      }
    });
  };

  return (
    <>
      <Tabs selectedKey={tab} onSelectionChange={key => setTab(String(key))}>
        <TabList className="flex gap-3 p-3 bg-white border-b border-neutral-200">
          <Tab id="rules">{t('discountEngine.tabs.rules')}</Tab>
          <Tab id="reasons">{t('discountEngine.tabs.reasons')}</Tab>
          <Tab id="permissions">{t('discountEngine.tabs.permissions')}</Tab>
        </TabList>

        <TabPanel id="rules">
          <TableComponent
            columns={columns}
            loaderHook={loadHook}
            loaderLineItems={columns.length}
            buttons={[
              <Button key="add" variant="primary" onClick={() => setFormModal(true)} icon={faPlus}>
                {t('buttons.discount')}
              </Button>
            ]}
          />

          {formModal && (
            <DiscountForm
              open={formModal}
              data={data}
              onClose={() => {
                setFormModal(false);
                setData(undefined);
                loadHook.fetchData();
              }}
            />
          )}
        </TabPanel>
        <TabPanel id="reasons"><DiscountReasonsAdmin/></TabPanel>
        <TabPanel id="permissions"><DiscountPermissionMatrix/></TabPanel>
      </Tabs>
    </>
  )
}
