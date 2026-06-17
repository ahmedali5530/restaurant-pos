import { useMemo, useState } from "react";
import { useAtom } from "jotai";
import { StringRecordId } from "surrealdb";
import { toast } from "sonner";
import { Layout } from "@/screens/partials/layout.tsx";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { Shift } from "@/api/model/shift.ts";
import { User } from "@/api/model/user.ts";
import { Order, OrderStatus } from "@/api/model/order.ts";
import { Setting } from "@/api/model/setting.ts";
import { Button } from "@/components/common/input/button.tsx";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import { DatePicker } from "@/components/common/antd/datepicker.tsx";
import { withCurrency } from "@/lib/utils.ts";
import { appPage } from "@/store/jotai.ts";
import { isOvernightShift } from "@/lib/shift.utils.ts";
import { DateValue } from "react-aria-components";
import { getLocalTimeZone, today } from "@internationalized/date";
import {useTranslation} from "react-i18next";

interface DistributionRow {
  user: User
  roleName: string
  weight: number
  amount: number
}

interface TipDistributionSettings {
  roles?: Array<{ role_id: string; weight: number }>
  users?: Array<{ user_id: string; weight: number }>
}

const normalizeId = (value: any): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "tb" in value && "id" in value) return `${value.tb}:${value.id}`;
  if (typeof value?.toString === "function") return value.toString();
  return String(value);
};

export const TipDistributionScreen = () => {
  const {t} = useTranslation(["summary", "toast"]);
  const db = useDB();
  const [page] = useAtom(appPage);

  const [selectedShiftId, setSelectedShiftId] = useState<string>("");
  const [shiftDate, setShiftDate] = useState<DateValue | null>(today(getLocalTimeZone()));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [totalTips, setTotalTips] = useState<number>(0);
  const [rows, setRows] = useState<DistributionRow[]>([]);

  const { data: shiftsData } = useApi<SettingsData<Shift>>(Tables.shifts, ["deleted_at = none"], ["name asc"], 0, 99999);
  const { data: usersData } = useApi<SettingsData<User>>(Tables.users, ["deleted_at = none"], ["first_name asc"], 0, 99999, ["user_role", "user_shift"]);
  const { data: settingsData } = useApi<SettingsData<Setting>>(Tables.settings, ["key = 'tip_distribution' and is_global = true"], [], 0, 1, ["values"]);

  const selectedShift = useMemo(() => (shiftsData?.data || []).find(item => normalizeId(item.id) === selectedShiftId), [shiftsData, selectedShiftId]);

  const getShiftDateRange = () => {
    if (!selectedShift || !shiftDate) {
      return null;
    }

    const shiftDateString = shiftDate.toString();
    const [year, month, day] = shiftDateString.split("-").map(Number);
    const [startHour, startMinute] = String(selectedShift.start_time || "00:00").split(":").map(Number);
    const [endHour, endMinute] = String(selectedShift.end_time || "00:00").split(":").map(Number);

    const fromDate = new Date(year, (month || 1) - 1, day || 1, startHour || 0, startMinute || 0, 0, 0);
    const toDate = new Date(year, (month || 1) - 1, day || 1, endHour || 0, endMinute || 0, 59, 999);

    const overnight = selectedShift.ends_next_day ?? isOvernightShift(selectedShift.start_time, selectedShift.end_time);
    if (overnight) {
      toDate.setDate(toDate.getDate() + 1);
    }

    return { fromDate, toDate };
  };

  const calculateDistribution = async () => {
    if (!selectedShiftId || !shiftDate) {
      toast.error(t("toast:tipDistribution.selectShiftAndDate"));
      return;
    }

    setLoading(true);
    try {
      const range = getShiftDateRange();
      if (!range) {
        toast.error(t("toast:tipDistribution.unableToDeriveRange"));
        return;
      }
      const { fromDate, toDate } = range;

      const [orders] = await db.query(
        `SELECT * FROM ${Tables.orders}
         WHERE status = $status
           AND completed_at >= $fromAt
           AND completed_at <= $toAt
         FETCH cashier, cashier.user_role, cashier.user_shift, user, user.user_role, user.user_shift`,
        {
          status: OrderStatus.Paid,
          fromAt: fromDate,
          toAt: toDate,
        }
      );

      const shiftUsers = (usersData?.data || []).filter((user) => normalizeId((user as any)?.user_shift?.id ?? (user as any)?.user_shift) === selectedShiftId);
      const tips = (orders || []).reduce((sum, order) => {
        const cashierShiftId = normalizeId((order as any)?.cashier?.user_shift?.id ?? (order as any)?.cashier?.user_shift);
        if (cashierShiftId !== selectedShiftId) {
          return sum;
        }
        return sum + Number(order.tip_amount || 0);
      }, 0);

      const values = (settingsData?.data?.[0]?.values || {}) as TipDistributionSettings;
      const roleWeights = new Map((values.roles || []).map(item => [normalizeId(item.role_id), Number(item.weight || 0)]));
      const userWeights = new Map((values.users || []).map(item => [normalizeId(item.user_id), Number(item.weight || 0)]));

      const computedRows: DistributionRow[] = shiftUsers.map((user) => {
        const userId = normalizeId(user.id);
        const roleId = normalizeId((user as any)?.user_role?.id ?? (user as any)?.user_role);
        const roleName = (user as any)?.user_role?.name || "-";
        const weight = userWeights.has(userId) ? Number(userWeights.get(userId) || 0) : Number(roleWeights.get(roleId) || 0);
        return {
          user,
          roleName,
          weight,
          amount: 0,
        };
      });

      const totalWeight = computedRows.reduce((sum, row) => sum + row.weight, 0);
      const finalRows = computedRows.map((row) => ({
        ...row,
        amount: totalWeight > 0 ? (tips * row.weight) / totalWeight : 0,
      }));

      setTotalTips(tips);
      setRows(finalRows);
    } catch (e) {
      toast.error(e);
    } finally {
      setLoading(false);
    }
  };

  const saveDistribution = async () => {
    if (!selectedShiftId || !shiftDate) {
      toast.error(t("toast:tipDistribution.selectShiftAndDate"));
      return;
    }

    setSaving(true);
    try {
      const range = getShiftDateRange();
      if (!range) {
        toast.error(t("toast:tipDistribution.unableToDeriveRange"));
        return;
      }
      const { fromDate, toDate } = range;

      const [distribution] = await db.create(Tables.tip_distributions, {
        shift: new StringRecordId(selectedShiftId),
        from_at: fromDate,
        to_at: toDate,
        total_tips: totalTips,
        users: [],
        created_by: page?.user?.id ? new StringRecordId(normalizeId(page.user.id)) : null,
        created_at: new Date(),
      });

      const userShareIds: any[] = [];
      for (const row of rows) {
        const [share] = await db.create(Tables.tip_distribution_user_shares, {
          tip_distribution: distribution.id,
          user: new StringRecordId(normalizeId(row.user.id)),
          weight: row.weight,
          amount: row.amount,
        });
        userShareIds.push(share.id);
      }

      await db.merge(distribution.id, {
        users: userShareIds,
      });
      toast.success(t("toast:tipDistribution.saved"));
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout containerClassName="p-5 flex flex-col gap-5">
      <div className="bg-white rounded-xl shadow p-4 grid grid-cols-3 gap-4 items-end">
        <div>
          <label>{t("summary:tipDistribution.shift")}</label>
          <ReactSelect
            value={selectedShiftId ? { value: selectedShiftId, label: selectedShift?.name || selectedShiftId } : null}
            onChange={(option: any) => setSelectedShiftId(option?.value || "")}
            options={(shiftsData?.data || []).map((item) => ({
              label: item.name,
              value: normalizeId(item.id),
            }))}
            isClearable
          />
        </div>
        <div>
          <DatePicker
            label={t("summary:tipDistribution.date")}
            maxValue={today(getLocalTimeZone())}
            value={shiftDate}
            onChange={setShiftDate}
            isClearable
          />
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={calculateDistribution} isLoading={loading}>{t("summary:tipDistribution.loadTips")}</Button>
          <Button variant="success" onClick={saveDistribution} isLoading={saving} disabled={rows.length === 0}>{t("summary:tipDistribution.submit")}</Button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <div className="mb-3 text-lg font-semibold">{t("summary:tipDistribution.totalTips", {amount: withCurrency(totalTips)})}</div>
        <table className="table-auto w-full border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">{t("summary:tipDistribution.columns.user")}</th>
              <th className="py-2">{t("summary:tipDistribution.columns.role")}</th>
              <th className="py-2">{t("summary:tipDistribution.columns.weight")}</th>
              <th className="py-2">{t("summary:tipDistribution.columns.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-neutral-500">{t("summary:tipDistribution.empty")}</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={normalizeId(row.user.id)} className="border-b">
                  <td className="py-2">{row.user.first_name} {row.user.last_name}</td>
                  <td className="py-2">{row.roleName}</td>
                  <td className="py-2">{row.weight}</td>
                  <td className="py-2">{withCurrency(row.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
};
