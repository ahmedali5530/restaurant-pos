import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {useState} from "react";
import {createColumnHelper} from "@tanstack/react-table";
import {Button} from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil} from "@fortawesome/free-solid-svg-icons";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Setting} from "@/api/model/setting.ts";
import {useTranslation} from 'react-i18next';
import {PrintForm} from "@/components/settings/prints/print.form.tsx";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {getAccessRuleChildLabel} from "@/lib/access.rules.i18n.ts";

export const AdminPrints = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const { protectAction } = useSecurity();
  const loadHook = useApi<SettingsData<Setting>>(Tables.settings, [
    '(key = "Temp Print" or key = "Final Print" or key = "Kitchen Print" or key = "Summary Print" or key = "Delivery Print")'
  ], ['priority asc']);

  const [data, setData] = useState<Setting>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<Setting>();

  const columns: any = [
    columnHelper.accessor("key", {
      header: t('columns.name')
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <>
            <IconTooltipButton label={t('common:actions.edit')}
              variant="primary"
              data-testid="admin-edit-print-setting"
              onClick={() => {
                protectAction(() => {
                  setData(info.row.original);
                  setFormModal(true);
                }, {
                  module: 'admin.print_settings.update',
                  description: getAccessRuleChildLabel('admin.print_settings.update'),
                });
              }}
            ><FontAwesomeIcon icon={faPencil}/></IconTooltipButton>
          </>
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
        buttons={[]}
      />

      {formModal && (
        <PrintForm
          open={formModal}
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}
    </>
  )
}