import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import {BuffetMenu} from "@/api/model/buffet_menu.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil, faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import {BuffetMenuForm} from "@/components/inventory/buffet/menus/form.tsx";
import {useBuffetMenuList} from "@/hooks/useBuffetMenuList.ts";
import {useDB} from "@/api/db/db.ts";
import {deleteBuffetMenu} from "@/lib/inventory/buffet.service.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {toast} from "sonner";
import classNames from "classnames";

export const BuffetMenus = () => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const loadHook = useBuffetMenuList(0, 10);
  const [data, setData] = useState<BuffetMenu>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<BuffetMenu>();

  const columns: any = [
    columnHelper.accessor("name", {header: t("columns.name")}),
    columnHelper.accessor("code", {header: t("columns.code")}),
    columnHelper.accessor("session_type", {
      header: t("buffet.sessionType"),
      cell: (info) => t(`buffet.sessionTypes.${info.getValue()}`),
    }),
    columnHelper.accessor("is_active", {
      header: t("columns.status"),
      cell: (info) => (
        <span
          className={classNames(
            "tag",
            info.getValue() ? "bg-success-100 text-success-800" : "bg-neutral-100"
          )}
        >
          {info.getValue() ? t("production.active") : t("production.inactive")}
        </span>
      ),
    }),
    columnHelper.accessor("items", {
      header: t("buffet.menuItems"),
      cell: (info) => info.getValue()?.length ?? 0,
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      cell: (info) => (
        <div className="flex gap-2">
          <Button
            variant="primary"
            iconButton
            onClick={() => {
              setData(info.row.original);
              setFormModal(true);
            }}
          >
            <FontAwesomeIcon icon={faPencil} />
          </Button>
          <Button
            variant="danger"
            iconButton
            onClick={async () => {
              if (!confirm(t("buffet.confirmDeleteMenu"))) return;
              try {
                await deleteBuffetMenu(db, recordToString(info.getValue())!);
                toast.success(t("buffet.menuDeleted"));
                loadHook.fetchData();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : t("buffet.menuDeleteFailed"));
              }
            }}
          >
            <FontAwesomeIcon icon={faTrash} />
          </Button>
        </div>
      ),
    }),
  ];

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        enableSearch={false}
        buttons={[
          <Button
            key="buffet-menu-create"
            variant="primary"
            onClick={() => setFormModal(true)}
            icon={faPlus}
          >
            {t("buffet.createMenu")}
          </Button>,
        ]}
      />

      {formModal && (
        <BuffetMenuForm
          open
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
