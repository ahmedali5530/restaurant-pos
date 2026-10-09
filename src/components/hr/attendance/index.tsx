import {useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import {DateValue} from "react-aria-components";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {TimeEntry} from "@/api/model/time_entry.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {IconTooltipButton} from "@/components/common/input/icon.tooltip.button.tsx";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {faCheck, faPlus} from "@fortawesome/free-solid-svg-icons";
import {entityLabel, formatDisplayDate} from "@/components/hr/shared/form.utils.ts";
import {AttendanceManualForm} from "@/components/hr/attendance/form.tsx";
import {useDB} from "@/api/db/db.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {toast} from "sonner";
import {approveEntry} from "@/lib/labor-engine/attendance/attendance.service.ts";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {AiSparklesIcon} from "@/components/common/icons/ai-sparkles.tsx";
import {createAttendanceImportConfig} from "@/components/hr/attendance/attendance.import.config.ts";
import {calendarDateToAppDateTime} from "@/lib/datetime.ts";
import {getToday} from "@/utils/date.ts";

export const HrAttendance = () => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const [page] = useAtom(appPage);
  const [date, setDate] = useState<DateValue | null>(getToday());

  // Computed once per `date` change; also used as useApi's initialFilters
  // below so the very first query is already scoped to today, not "all dates".
  const dateFilters = useMemo(() => {
    if (!date) return [];
    const dayStart = calendarDateToAppDateTime({year: date.year, month: date.month, day: date.day});
    const dayEnd = dayStart.plus({days: 1});
    const startIso = dayStart.toUTC().toISO();
    const endIso = dayEnd.toUTC().toISO();
    if (!startIso || !endIso) return [];
    return [`clock_in >= <datetime>"${startIso}" AND clock_in < <datetime>"${endIso}"`];
  }, [date]);

  const loadHook = useApi<SettingsData<TimeEntry>>(
    Tables.time_entries,
    dateFilters,
    ["clock_in DESC"],
    0,
    10,
    ["employee", "user", "approved_by"],
  );

  const [formModal, setFormModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [approvingId, setApprovingId] = useState<string>();

  const smartImportConfig = useMemo(
    () => createAttendanceImportConfig({db, t, user: page.user}),
    [t, page.user]
  );

  const columnHelper = createColumnHelper<TimeEntry>();

  const handleApprove = async (entry: TimeEntry) => {
    if (!page.user) {
      toast.error(t("messages.requiredFields"));
      return;
    }
    setApprovingId(entry.id);
    try {
      await approveEntry(db, {timeEntryId: entry.id, approvedBy: page.user, source: entry.source ?? 'manual'});
      toast.success(t("attendance.approveEntry"));
      loadHook.fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setApprovingId(undefined);
    }
  };

  const columns: any = [
    columnHelper.accessor((row) => entityLabel(row.employee), {
      id: "employee",
      header: t("columns.employee"),
      meta: {filterField: "string::concat(employee.first_name, ' ', employee.last_name ?? '')"},
    }),
    columnHelper.accessor("clock_in", {
      header: t("columns.clockIn"),
      cell: (info) => formatDisplayDate(info.getValue()),
      meta: {filterField: "<string>clock_in"},
    }),
    columnHelper.accessor("clock_out", {
      header: t("columns.clockOut"),
      cell: (info) => formatDisplayDate(info.getValue()),
      meta: {filterField: "<string>clock_out"},
    }),
    columnHelper.accessor("attendance_status", {
      header: t("columns.attendanceStatus"),
      cell: (info) => {
        const value = info.getValue();
        if (!value) return "";
        const key = value === "early_leave" ? "earlyLeave" : value === "missed_shift" ? "missedShift" : value;
        return t(`attendance.${key}`, {defaultValue: value});
      },
    }),
    columnHelper.accessor("approval_status", {
      header: t("columns.approvalStatus"),
      cell: (info) => {
        const value = info.getValue();
        return value ? t(`status.approval.${value}`, {defaultValue: value}) : "";
      },
    }),
    columnHelper.accessor("source", {
      header: t("columns.source"),
      cell: (info) => {
        const value = info.getValue();
        if (!value) return "";
        const key = value.charAt(0).toUpperCase() + value.slice(1);
        return t(`attendance.source${key}`, {defaultValue: value});
      },
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const row = info.row.original;
        if (row.approval_status === "approved") return null;
        return (
          <IconTooltipButton
            label={t("buttons.approve")}
            variant="success"
            icon={faCheck}
            disabled={approvingId === row.id}
            onClick={() => void handleApprove(row)}
          />
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
        externalFilters={dateFilters}
        buttons={[
          <DatePicker
            key="attendance-date"
            value={date}
            onChange={setDate}
            isClearable
            maxValue={getToday()}
          />,
          <Button key="manual-entry" variant="primary" data-testid="hr-add-attendance" onClick={() => setFormModal(true)} icon={faPlus}>
            {t("buttons.manualEntry")}
          </Button>,
          <Button key="attendance-import" variant="primary" onClick={() => setImportModal(true)}>
            <span className="mr-2"><AiSparklesIcon /></span>
            {t("common:actions.smartImport", {defaultValue: "AI Import"})}
          </Button>,
        ]}
      />
      {formModal && (
        <AttendanceManualForm
          open
          onClose={() => {
            setFormModal(false);
            loadHook.fetchData();
          }}
        />
      )}
      {importModal && (
        <DataImportModal
          isOpen
          onClose={() => {
            setImportModal(false);
            loadHook.fetchData();
          }}
          config={smartImportConfig}
          title={t("attendance.smartImportTitle", {defaultValue: "AI Import attendance"})}
          enableImportModes
          defaultMatchFields={["employee", "clock_in"]}
          onExport={async () => {
            const [rows] = await db.query(
              `SELECT * FROM ${Tables.time_entries} FETCH employee`
            );
            return (rows as TimeEntry[]).map((row) => ({
              employee: row.employee?.employee_number
                || `${row.employee?.first_name ?? ""} ${row.employee?.last_name ?? ""}`.trim(),
              clock_in: row.clock_in ? String(row.clock_in) : "",
              clock_out: row.clock_out ? String(row.clock_out) : "",
              notes: row.notes ?? "",
            }));
          }}
          onDone={() => loadHook.fetchData()}
        />
      )}
    </>
  );
};
