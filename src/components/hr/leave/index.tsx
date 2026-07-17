import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {LeaveType} from "@/api/model/leave_type.ts";
import {LeaveRequest} from "@/api/model/leave_request.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faCheck, faPencil, faPlus, faXmark} from "@fortawesome/free-solid-svg-icons";
import {LeaveTypeForm, LeaveRequestForm} from "@/components/hr/leave/form.tsx";
import {entityLabel, formatDisplayDate} from "@/components/hr/shared/form.utils.ts";
import {useDB} from "@/api/db/db.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {toast} from "sonner";
import {approveRequest, rejectRequest} from "@/lib/labor-engine/leave/leave.service.ts";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";

export const HrLeave = () => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const [page] = useAtom(appPage);
  const [subTab, setSubTab] = useState<"types" | "requests">("requests");

  const typesHook = useApi<SettingsData<LeaveType>>(Tables.leave_types, [], [], 0, 10, []);
  const requestsHook = useApi<SettingsData<LeaveRequest>>(
    Tables.leave_requests,
    [],
    ["start_date DESC"],
    0,
    10,
    ["employee", "leave_type", "approved_by"],
  );

  const [leaveType, setLeaveType] = useState<LeaveType>();
  const [leaveRequest, setLeaveRequest] = useState<LeaveRequest>();
  const [typeModal, setTypeModal] = useState(false);
  const [requestModal, setRequestModal] = useState(false);
  const [actionId, setActionId] = useState<string>();

  const typeHelper = createColumnHelper<LeaveType>();
  const requestHelper = createColumnHelper<LeaveRequest>();

  const handleApprove = async (request: LeaveRequest) => {
    if (!page.user) return;
    setActionId(request.id);
    try {
      await approveRequest(db, {requestId: request.id, approvedBy: page.user});
      toast.success(t("messages.leaveApproved"));
      requestsHook.fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setActionId(undefined);
    }
  };

  const handleReject = async (request: LeaveRequest) => {
    if (!page.user) return;
    setActionId(request.id);
    try {
      await rejectRequest(db, {requestId: request.id, rejectedBy: page.user});
      toast.success(t("messages.leaveRejected"));
      requestsHook.fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setActionId(undefined);
    }
  };

  const typeColumns: any = [
    typeHelper.accessor("code", {header: t("columns.code")}),
    typeHelper.accessor("name", {header: t("columns.name")}),
    typeHelper.accessor("paid", {
      header: t("columns.paid"),
      cell: (info) => (info.getValue() ? t("columns.paid") : "—"),
    }),
    typeHelper.accessor("max_days_per_year", {header: t("columns.maxDaysPerYear")}),
    typeHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => (
        <Button variant="primary" onClick={() => { setLeaveType(info.row.original); setTypeModal(true); }}>
          <FontAwesomeIcon icon={faPencil}/>
        </Button>
      ),
    }),
  ];

  const requestColumns: any = [
    requestHelper.accessor((row) => entityLabel(row.employee), {id: "employee", header: t("columns.employee")}),
    requestHelper.accessor((row) => entityLabel(row.leave_type), {id: "leave_type", header: t("columns.leaveType")}),
    requestHelper.accessor("start_date", {
      header: t("columns.startDate"),
      cell: (info) => formatDisplayDate(info.getValue()),
    }),
    requestHelper.accessor("end_date", {
      header: t("columns.endDate"),
      cell: (info) => formatDisplayDate(info.getValue()),
    }),
    requestHelper.accessor("days", {header: t("columns.days")}),
    requestHelper.accessor("status", {
      header: t("columns.status"),
      cell: (info) => {
        const value = info.getValue();
        return value ? t(`status.leave.${value}`, {defaultValue: value}) : "";
      },
    }),
    requestHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const row = info.row.original;
        if (row.status !== "pending") {
          return (
            <Button variant="primary" onClick={() => { setLeaveRequest(row); setRequestModal(true); }}>
              <FontAwesomeIcon icon={faPencil}/>
            </Button>
          );
        }
        return (
          <div className="flex gap-2">
            <Button variant="success" disabled={actionId === row.id} onClick={() => void handleApprove(row)}>
              <FontAwesomeIcon icon={faCheck}/>
            </Button>
            <DeleteConfirm
              title={t("confirm.title")}
              message={t("confirm.rejectLeave")}
              onConfirm={() => handleReject(row)}
            >
              <Button variant="danger" disabled={actionId === row.id}>
                <FontAwesomeIcon icon={faXmark}/>
              </Button>
            </DeleteConfirm>
          </div>
        );
      },
    }),
  ];

  return (
    <div className="p-2 space-y-4">
      <div className="flex gap-2 px-2">
        <Button variant="primary" active={subTab === "requests"} onClick={() => setSubTab("requests")}>
          {t("buttons.leaveRequest")}
        </Button>
        <Button variant="primary" active={subTab === "types"} onClick={() => setSubTab("types")}>
          {t("buttons.leaveType")}
        </Button>
      </div>

      {subTab === "types" ? (
        <TableComponent
          columns={typeColumns}
          loaderHook={typesHook}
          loaderLineItems={typeColumns.length}
          buttons={[
            <Button key="leave-type-create" variant="primary" onClick={() => { setLeaveType(undefined); setTypeModal(true); }} icon={faPlus}>
              {t("buttons.leaveType")}
            </Button>,
          ]}
        />
      ) : (
        <TableComponent
          columns={requestColumns}
          loaderHook={requestsHook}
          loaderLineItems={requestColumns.length}
          buttons={[
            <Button key="leave-request-create" variant="primary" onClick={() => { setLeaveRequest(undefined); setRequestModal(true); }} icon={faPlus}>
              {t("buttons.leaveRequest")}
            </Button>,
          ]}
        />
      )}

      {typeModal && (
        <LeaveTypeForm
          open
          data={leaveType}
          onClose={() => {
            setTypeModal(false);
            setLeaveType(undefined);
            typesHook.fetchData();
          }}
        />
      )}
      {requestModal && (
        <LeaveRequestForm
          open
          data={leaveRequest}
          onClose={() => {
            setRequestModal(false);
            setLeaveRequest(undefined);
            requestsHook.fetchData();
          }}
        />
      )}
    </div>
  );
};
