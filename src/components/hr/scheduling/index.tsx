import {useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {WorkSchedule} from "@/api/model/work_schedule.ts";
import {ScheduledShift} from "@/api/model/scheduled_shift.ts";
import {ScheduleTemplate} from "@/api/model/schedule_template.ts";
import {ShiftSwapRequest} from "@/api/model/shift_swap_request.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {IconTooltipButton} from "@/components/common/input/icon.tooltip.button.tsx";
import {faCheck, faPencil, faPlus, faTrash, faUpload, faXmark} from "@fortawesome/free-solid-svg-icons";
import {formatDisplayDate, entityLabel} from "@/components/hr/shared/form.utils.ts";
import {useDB} from "@/api/db/db.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {toast} from "sonner";
import {
  cancelScheduledShift,
  deleteSchedule,
  publishSchedule,
} from "@/lib/labor-engine/scheduling/schedule.service.ts";
import {approveSwap, rejectSwap} from "@/lib/labor-engine/scheduling/swap.service.ts";
import {ScheduleForm} from "@/components/hr/scheduling/schedule.form.tsx";
import {ScheduledShiftForm} from "@/components/hr/scheduling/shift.form.tsx";
import {ScheduleTemplateForm} from "@/components/hr/scheduling/template.form.tsx";
import {GenerateScheduleForm} from "@/components/hr/scheduling/generate.form.tsx";
import {SwapRequestForm} from "@/components/hr/scheduling/swap.form.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {createScheduledShiftImportConfig} from "@/components/hr/scheduling/scheduled-shift.import.config.ts";

type SubTab = "schedules" | "shifts" | "templates" | "swaps";

export const HrScheduling = () => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const [page] = useAtom(appPage);
  const [subTab, setSubTab] = useState<SubTab>("schedules");

  const schedulesHook = useApi<SettingsData<WorkSchedule>>(
    Tables.work_schedules,
    [],
    ["period_start DESC"],
    0,
    10,
    ["published_by"],
  );

  const shiftsHook = useApi<SettingsData<ScheduledShift>>(
    Tables.scheduled_shifts,
    ["status != 'cancelled'"],
    ["start_at DESC"],
    0,
    10,
    ["employee", "work_schedule", "department", "position"],
  );

  const templatesHook = useApi<SettingsData<ScheduleTemplate>>(
    Tables.schedule_templates,
    [],
    ["name asc"],
    0,
    10,
    ["shift_template", "department", "position", "cost_center"],
  );

  const swapsHook = useApi<SettingsData<ShiftSwapRequest>>(
    Tables.shift_swap_requests,
    [],
    ["id DESC"],
    0,
    10,
    ["scheduled_shift", "requesting_employee", "target_employee", "approved_by"],
  );

  const [schedule, setSchedule] = useState<WorkSchedule>();
  const [shift, setShift] = useState<ScheduledShift>();
  const [template, setTemplate] = useState<ScheduleTemplate>();
  const [scheduleModal, setScheduleModal] = useState(false);
  const [shiftModal, setShiftModal] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);
  const [generateModal, setGenerateModal] = useState(false);
  const [swapModal, setSwapModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [publishingId, setPublishingId] = useState<string>();
  const [actionId, setActionId] = useState<string>();

  const shiftImportConfig = useMemo(
    () => createScheduledShiftImportConfig({db, t}),
    [db, t]
  );

  const scheduleHelper = createColumnHelper<WorkSchedule>();
  const shiftHelper = createColumnHelper<ScheduledShift>();
  const templateHelper = createColumnHelper<ScheduleTemplate>();
  const swapHelper = createColumnHelper<ShiftSwapRequest>();

  const handlePublish = async (row: WorkSchedule) => {
    if (!page.user) {
      toast.error(t("messages.requiredFields"));
      return;
    }
    setPublishingId(row.id);
    try {
      await publishSchedule(db, {scheduleId: row.id, publishedBy: page.user});
      toast.success(t("messages.schedulePublished"));
      schedulesHook.fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPublishingId(undefined);
    }
  };

  const handleDeleteSchedule = async (row: WorkSchedule) => {
    setActionId(row.id);
    try {
      await deleteSchedule(db, row.id, page.user);
      toast.success(t("messages.scheduleDeleted"));
      schedulesHook.fetchData();
      shiftsHook.fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setActionId(undefined);
    }
  };

  const handleCancelShift = async (row: ScheduledShift) => {
    setActionId(row.id);
    try {
      await cancelScheduledShift(db, row.id);
      toast.success(t("messages.shiftCancelled"));
      shiftsHook.fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setActionId(undefined);
    }
  };

  const handleApproveSwap = async (row: ShiftSwapRequest) => {
    if (!page.user) return;
    setActionId(row.id);
    try {
      await approveSwap(db, {swapRequestId: row.id, approvedBy: page.user});
      toast.success(t("messages.swapApproved"));
      swapsHook.fetchData();
      shiftsHook.fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setActionId(undefined);
    }
  };

  const handleRejectSwap = async (row: ShiftSwapRequest) => {
    if (!page.user) return;
    setActionId(row.id);
    try {
      await rejectSwap(db, {swapRequestId: row.id, rejectedBy: page.user});
      toast.success(t("messages.swapRejected"));
      swapsHook.fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setActionId(undefined);
    }
  };

  const scheduleColumns: any = [
    scheduleHelper.accessor("name", {header: t("columns.name")}),
    scheduleHelper.accessor("period_start", {
      header: t("columns.periodStart"),
      cell: (info) => formatDisplayDate(info.getValue()),
    }),
    scheduleHelper.accessor("period_end", {
      header: t("columns.periodEnd"),
      cell: (info) => formatDisplayDate(info.getValue()),
    }),
    scheduleHelper.accessor("status", {
      header: t("columns.status"),
      cell: (info) => {
        const value = info.getValue();
        return value ? t(`status.schedule.${value}`, {defaultValue: value}) : "";
      },
    }),
    scheduleHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const row = info.row.original;
        const isDraft = row.status !== "published";
        return (
          <div className="flex gap-2">
            {isDraft && (
              <>
                <IconTooltipButton
                  label={t("buttons.edit")}
                  variant="primary"
                  icon={faPencil}
                  onClick={() => { setSchedule(row); setScheduleModal(true); }}
                />
                <Button
                  variant="success"
                  disabled={publishingId === row.id}
                  onClick={() => void handlePublish(row)}
                >
                  {t("buttons.publish")}
                </Button>
                <DeleteConfirm
                  message={t("confirm.deleteSchedule")}
                  onConfirm={() => handleDeleteSchedule(row)}
                >
                  <IconTooltipButton
                    label={t("buttons.delete")}
                    variant="danger"
                    icon={faTrash}
                    disabled={actionId === row.id}
                  />
                </DeleteConfirm>
                <Button
                  variant="neutral"
                  onClick={() => { setSchedule(row); setShiftModal(true); }}
                >
                  {t("scheduling.addShift")}
                </Button>
              </>
            )}
          </div>
        );
      },
    }),
  ];

  const shiftColumns: any = [
    shiftHelper.accessor((row) => entityLabel(row.employee), {id: "employee", header: t("columns.employee")}),
    shiftHelper.accessor((row) => row.work_schedule?.name ?? "", {id: "schedule", header: t("columns.name")}),
    shiftHelper.accessor("start_at", {
      header: t("columns.startAt"),
      cell: (info) => formatDisplayDate(info.getValue()),
    }),
    shiftHelper.accessor("end_at", {
      header: t("columns.endAt"),
      cell: (info) => formatDisplayDate(info.getValue()),
    }),
    shiftHelper.accessor((row) => entityLabel(row.department), {id: "department", header: t("columns.department")}),
    shiftHelper.accessor("status", {
      header: t("columns.status"),
      cell: (info) => {
        const value = info.getValue();
        if (!value) return "";
        const key = value === "no_show" ? "noShow" : value;
        return t(`status.schedule.${key}`, {defaultValue: value});
      },
    }),
    shiftHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const row = info.row.original;
        const canEdit = row.work_schedule?.status !== "published";
        return (
          <div className="flex gap-2">
            {canEdit && (
              <IconTooltipButton
                label={t("buttons.edit")}
                variant="primary"
                icon={faPencil}
                onClick={() => { setShift(row); setShiftModal(true); }}
              />
            )}
            <DeleteConfirm
              message={t("confirm.deleteShift")}
              onConfirm={() => handleCancelShift(row)}
            >
              <IconTooltipButton
                label={t("buttons.delete")}
                variant="danger"
                icon={faTrash}
                disabled={actionId === row.id}
              />
            </DeleteConfirm>
          </div>
        );
      },
    }),
  ];

  const templateColumns: any = [
    templateHelper.accessor("name", {header: t("columns.name")}),
    templateHelper.accessor("start_time", {header: t("forms.scheduleTemplate.startTime")}),
    templateHelper.accessor("end_time", {header: t("forms.scheduleTemplate.endTime")}),
    templateHelper.accessor((row) => entityLabel(row.department), {id: "department", header: t("columns.department")}),
    templateHelper.accessor("is_active", {
      header: t("columns.status"),
      cell: (info) => (info.getValue() !== false ? t("status.employment.active") : t("status.employment.inactive")),
    }),
    templateHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => (
        <IconTooltipButton
          label={t("buttons.edit")}
          variant="primary"
          icon={faPencil}
          onClick={() => { setTemplate(info.row.original); setTemplateModal(true); }}
        />
      ),
    }),
  ];

  const swapColumns: any = [
    swapHelper.accessor((row) => entityLabel(row.requesting_employee), {id: "requesting", header: t("forms.swap.requestingEmployee")}),
    swapHelper.accessor((row) => entityLabel(row.target_employee), {id: "target", header: t("forms.swap.targetEmployee")}),
    swapHelper.accessor((row) => formatDisplayDate(row.scheduled_shift?.start_at), {id: "shift", header: t("columns.startAt")}),
    swapHelper.accessor("status", {
      header: t("columns.status"),
      cell: (info) => {
        const value = info.getValue();
        return value ? t(`status.leave.${value}`, {defaultValue: value}) : "";
      },
    }),
    swapHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const row = info.row.original;
        if (row.status !== "pending") return null;
        return (
          <div className="flex gap-2">
            <IconTooltipButton
              label={t("buttons.approve")}
              variant="success"
              icon={faCheck}
              disabled={actionId === row.id}
              onClick={() => void handleApproveSwap(row)}
            />
            <DeleteConfirm
              title={t("confirm.title")}
              message={t("confirm.rejectSwap")}
              onConfirm={() => handleRejectSwap(row)}
            >
              <IconTooltipButton
                label={t("buttons.reject")}
                variant="danger"
                icon={faXmark}
                disabled={actionId === row.id}
              />
            </DeleteConfirm>
          </div>
        );
      },
    }),
  ];

  const refreshAll = () => {
    schedulesHook.fetchData();
    shiftsHook.fetchData();
    templatesHook.fetchData();
    swapsHook.fetchData();
  };

  return (
    <div className="p-2 space-y-4">
      <div className="flex flex-wrap gap-2 px-2">
        <Button variant="primary" active={subTab === "schedules"} onClick={() => setSubTab("schedules")}>
          {t("tabs.scheduling")}
        </Button>
        <Button variant="primary" active={subTab === "shifts"} onClick={() => setSubTab("shifts")}>
          {t("scheduling.assignedShifts")}
        </Button>
        <Button variant="primary" active={subTab === "templates"} onClick={() => setSubTab("templates")}>
          {t("scheduling.templates")}
        </Button>
        <Button variant="primary" active={subTab === "swaps"} onClick={() => setSubTab("swaps")}>
          {t("scheduling.swapRequests")}
        </Button>
      </div>

      {subTab === "schedules" && (
        <TableComponent
          columns={scheduleColumns}
          loaderHook={schedulesHook}
          loaderLineItems={scheduleColumns.length}
          buttons={[
            <Button key="schedule-create" variant="primary" onClick={() => { setSchedule(undefined); setScheduleModal(true); }} icon={faPlus}>
              {t("buttons.schedule")}
            </Button>,
            <Button key="generate-shifts" variant="warning" onClick={() => setGenerateModal(true)}>
              {t("scheduling.generateFromTemplate")}
            </Button>,
          ]}
        />
      )}

      {subTab === "shifts" && (
        <TableComponent
          columns={shiftColumns}
          loaderHook={shiftsHook}
          loaderLineItems={shiftColumns.length}
          buttons={[
            <Button key="shift-import" variant="secondary" onClick={() => setImportModal(true)} icon={faUpload}>
              {t("common:actions.smartImport", {defaultValue: "Smart Import"})}
            </Button>,
            <Button key="shift-create" variant="primary" onClick={() => { setShift(undefined); setSchedule(undefined); setShiftModal(true); }} icon={faPlus}>
              {t("buttons.scheduledShift")}
            </Button>,
          ]}
        />
      )}

      {subTab === "templates" && (
        <TableComponent
          columns={templateColumns}
          loaderHook={templatesHook}
          loaderLineItems={templateColumns.length}
          buttons={[
            <Button key="template-create" variant="primary" onClick={() => { setTemplate(undefined); setTemplateModal(true); }} icon={faPlus}>
              {t("buttons.scheduleTemplate")}
            </Button>,
          ]}
        />
      )}

      {subTab === "swaps" && (
        <TableComponent
          columns={swapColumns}
          loaderHook={swapsHook}
          loaderLineItems={swapColumns.length}
          buttons={[
            <Button key="swap-create" variant="primary" onClick={() => setSwapModal(true)} icon={faPlus}>
              {t("buttons.requestSwap")}
            </Button>,
          ]}
        />
      )}

      {scheduleModal && (
        <ScheduleForm
          open
          data={schedule}
          onClose={() => {
            setScheduleModal(false);
            setSchedule(undefined);
            refreshAll();
          }}
        />
      )}

      {shiftModal && (
        <ScheduledShiftForm
          open
          data={shift}
          defaultSchedule={schedule}
          onClose={() => {
            setShiftModal(false);
            setShift(undefined);
            setSchedule(undefined);
            refreshAll();
          }}
        />
      )}

      {templateModal && (
        <ScheduleTemplateForm
          open
          data={template}
          onClose={() => {
            setTemplateModal(false);
            setTemplate(undefined);
            templatesHook.fetchData();
          }}
        />
      )}

      {generateModal && (
        <GenerateScheduleForm
          open
          onClose={() => {
            setGenerateModal(false);
            refreshAll();
          }}
        />
      )}

      {swapModal && (
        <SwapRequestForm
          open
          onClose={() => {
            setSwapModal(false);
            swapsHook.fetchData();
          }}
        />
      )}

      {importModal && (
        <DataImportModal
          isOpen
          onClose={() => setImportModal(false)}
          config={shiftImportConfig}
          title={t("scheduling.smartImportShiftsTitle", {defaultValue: "Smart import scheduled shifts"})}
          onDone={() => {
            setImportModal(false);
            shiftsHook.fetchData();
          }}
        />
      )}
    </div>
  );
};
