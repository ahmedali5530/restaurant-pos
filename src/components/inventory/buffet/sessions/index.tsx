import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import classNames from "classnames";
import {BuffetSession} from "@/api/model/buffet_session.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faEye, faPlus} from "@fortawesome/free-solid-svg-icons";
import {useBuffetSessionList} from "@/hooks/useBuffetSessionList.ts";
import {BuffetSessionForm} from "@/components/inventory/buffet/sessions/form.tsx";
import {BuffetSessionDashboard} from "@/components/inventory/buffet/sessions/dashboard.tsx";
import {BuffetSessionViewModal} from "@/components/inventory/buffet/sessions/view.modal.tsx";
import {formatNumber} from "@/lib/utils.ts";
import {recordToString} from "@/api/reports/shared/records.ts";

export const BuffetSessions = () => {
  const {t} = useTranslation("inventory");
  const loadHook = useBuffetSessionList(0, 10);
  const [formOpen, setFormOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [viewSession, setViewSession] = useState<BuffetSession>();

  const columnHelper = createColumnHelper<BuffetSession>();

  const statusClass = (status: string) => {
    switch (status) {
      case "in_progress":
        return "bg-info-100 text-info-800";
      case "closed":
        return "bg-success-100 text-success-800";
      case "voided":
        return "bg-danger-100 text-danger-800";
      case "closing":
        return "bg-warning-100 text-warning-800";
      default:
        return "bg-neutral-100";
    }
  };

  const columns: any = [
    columnHelper.accessor("session_number", {header: t("buffet.sessionNumber")}),
    columnHelper.accessor("business_date", {header: t("buffet.businessDate")}),
    columnHelper.accessor("session_type", {
      header: t("buffet.sessionType"),
      cell: (info) => t(`buffet.sessionTypes.${info.getValue()}`),
    }),
    columnHelper.accessor("store", {
      header: t("columns.store"),
      cell: (info) => info.getValue()?.name ?? "",
    }),
    columnHelper.accessor("menu", {
      header: t("buffet.menu"),
      cell: (info) => info.getValue()?.name ?? "",
    }),
    columnHelper.accessor("expected_guests", {header: t("buffet.expectedGuests")}),
    columnHelper.accessor("actual_guests", {header: t("buffet.actualGuests")}),
    columnHelper.accessor("buffet_price", {
      header: t("buffet.buffetPrice"),
      cell: (info) => formatNumber(info.getValue()),
    }),
    columnHelper.accessor("status", {
      header: t("columns.status"),
      cell: (info) => (
        <span className={classNames("tag", statusClass(info.getValue()))}>
          {t(`buffet.statuses.${info.getValue()}`)}
        </span>
      ),
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      cell: (info) => {
        const session = info.row.original;
        const isClosed = session.status === "closed" || session.status === "voided";

        return (
          <div className="flex gap-2">
            {isClosed ? (
              <Button
                variant="primary"
                iconButton
                onClick={() => setViewSession(session)}
              >
                <FontAwesomeIcon icon={faEye} />
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => setActiveSessionId(recordToString(session.id)!)}
              >
                {t("buffet.openSession")}
              </Button>
            )}
          </div>
        );
      },
    }),
  ];

  if (activeSessionId) {
    return (
      <BuffetSessionDashboard
        sessionId={activeSessionId}
        onBack={() => {
          setActiveSessionId(undefined);
          loadHook.fetchData();
        }}
      />
    );
  }

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        enableSearch={false}
        buttons={[
          <Button
            key="buffet-session-create"
            variant="primary"
            onClick={() => setFormOpen(true)}
            icon={faPlus}
          >
            {t("buffet.createSession")}
          </Button>,
        ]}
      />

      {formOpen && (
        <BuffetSessionForm
          open
          onClose={() => {
            setFormOpen(false);
            loadHook.fetchData();
          }}
          onCreated={(sessionId) => {
            setFormOpen(false);
            setActiveSessionId(sessionId);
            loadHook.fetchData();
          }}
        />
      )}

      {viewSession && (
        <BuffetSessionViewModal
          sessionId={recordToString(viewSession.id)!}
          open
          onClose={() => setViewSession(undefined)}
        />
      )}
    </>
  );
};
