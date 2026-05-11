import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/common/input/button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import { TableComponent } from "@/components/common/table/table.tsx";
import { Floor } from "@/api/model/floor.ts";
import { FloorForm } from "@/components/settings/floors/floor.form.tsx";
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { AdminFloorLayout } from "@/components/settings/floors/layout/layout.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";

export const AdminFloors = () => {
  const loadHook = useApi<SettingsData<Floor>>(Tables.floors, ['deleted_at = none'], [], 0, 10, ['tables']);
  const db = useDB();

  const [data, setData] = useState<Floor>();
  const [formModal, setFormModal] = useState(false);
  const [layoutModal, setLayoutModal] = useState(false);

  const columnHelper = createColumnHelper<Floor>();
  const columns: any = [
    columnHelper.accessor("name", {
      header: 'Name'
    }),
    columnHelper.accessor("priority", {
      header: 'Priority'
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <div className="flex gap-3 items-center">
            <Button
              variant="primary"
              type="button"
              onClick={() => {
                setData(info.row.original);
                setFormModal(true);
              }}
            ><FontAwesomeIcon icon={faPencil}/></Button>
            <Button
              variant="warning"
              type="button"
              onClick={() => {
                setLayoutModal(true)
                setData(info.row.original);
              }}
            >
              Layout
            </Button>
            <div className="separator"></div>
            <DeleteConfirm
              message={`Delete floor ${info.row.original.name}`}
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
      entityLabel: 'Floor',
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.tables} WHERE floor = $idRecord GROUP ALL`
        },
        {
          query: `SELECT count() AS count FROM ${Tables.orders} WHERE floor = $idRecord GROUP ALL`
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
          }} icon={faPlus}> Floor</Button>
        ]}
      />

      {formModal && (
        <FloorForm
          open={formModal}
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}

      {layoutModal && (
        <Modal
          size="full"
          open={layoutModal}
          onClose={() => {
            setData(undefined);
            setLayoutModal(false);
          }}
          title={`Layout of ${data?.name} floor`}
          shouldCloseOnOverlayClick={false}
        >
          {data && (
            <AdminFloorLayout floor={data} />
          )}
        </Modal>
      )}

    </>
  )
}
