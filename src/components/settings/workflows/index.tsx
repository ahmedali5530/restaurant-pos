import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/common/input/button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import { TableComponent } from "@/components/common/table/table.tsx";
import { Workflow } from "@/api/model/workflow.ts";
import { WorkflowForm } from "@/components/settings/workflows/workflow.form.tsx";
import { DeleteConfirm } from "@/components/common/table/delete.confirm.tsx";
import { useDB } from "@/api/db/db.ts";
import { executeSettingsDelete } from "@/lib/settings-delete.service.ts";

export const AdminWorkflows = () => {
  const loadHook = useApi<SettingsData<Workflow>>(Tables.workflows, ['deleted_at = none'], ['name asc'], 0, 10, []);
  const db = useDB();

  const [data, setData] = useState<Workflow>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<Workflow>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: 'Name'
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
              onClick={() => {
                setData(info.row.original);
                setFormModal(true);
              }}
            ><FontAwesomeIcon icon={faPencil}/></Button>
            <div className="separator"></div>
            <DeleteConfirm
              message={`Delete workflow ${info.row.original.name}`}
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
      entityLabel: 'Workflow',
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.dishes} WHERE workflow = $idRecord AND deleted_at = none GROUP ALL`
        }
      ],
      cleanupQueries: [
        {
          query: `DELETE ${Tables.workflow_stages} WHERE workflow = $idRecord`
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
          }} icon={faPlus}> Workflow</Button>
        ]}
      />

      {formModal && (
        <WorkflowForm
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
