import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {useState} from "react";
import {createColumnHelper} from "@tanstack/react-table";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil} from "@fortawesome/free-solid-svg-icons";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Setting} from "@/api/model/setting.ts";
import {PrintForm} from "@/components/settings/prints/print.form.tsx";

export const AdminPrints = () => {
  const loadHook = useApi<SettingsData<Setting>>(Tables.settings, [
    '(key = "Temp Print" or key = "Final Print" or key = "Kitchen Print" or key = "Summary Print" or key = "Delivery Print")'
  ], ['priority asc']);

  const [data, setData] = useState<Setting>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<Setting>();

  const columns: any = [
    columnHelper.accessor("key", {
      header: 'Name'
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <>
            <Button
              variant="primary"
              onClick={() => {
                setData(info.row.original);
                setFormModal(true);
              }}
            ><FontAwesomeIcon icon={faPencil}/></Button>
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