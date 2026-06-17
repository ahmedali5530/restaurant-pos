import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { toast } from "sonner";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { UserRole } from "@/api/model/user_role.ts";
import { User } from "@/api/model/user.ts";
import { Setting } from "@/api/model/setting.ts";
import { useDB } from "@/api/db/db.ts";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import {useTranslation} from 'react-i18next';

interface RoleDistributionRow {
  role_id: string
  weight: number
}

interface UserDistributionRow {
  user_id: string
  weight: number
}

interface TipDistributionValues {
  roles?: RoleDistributionRow[]
  users?: UserDistributionRow[]
}

export const AdminTipDistribution = () => {
  const db = useDB();
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const [settings, setSettings] = useState<Setting>();
  const [roleRows, setRoleRows] = useState<RoleDistributionRow[]>([]);
  const [userRows, setUserRows] = useState<UserDistributionRow[]>([]);
  const [saving, setSaving] = useState(false);

  const {
    data: roleData,
  } = useApi<SettingsData<UserRole>>(Tables.user_roles, ["deleted_at = none"], ["name asc"], 0, 99999);

  const {
    data: userData,
  } = useApi<SettingsData<User>>(Tables.users, ["deleted_at = none"], ["first_name asc"], 0, 99999);

  const normalizeId = (value: any): string => {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object" && "tb" in value && "id" in value) {
      return `${value.tb}:${value.id}`;
    }
    if (typeof value?.toString === "function") {
      return value.toString();
    }
    return String(value);
  };

  const normalizeText = (value: any): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return normalizeId(value);
  };

  const loadSettings = useCallback(async () => {
    const [settingRows] = await db.query(
      `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
      { key: "tip_distribution" }
    );
    const found = settingRows?.[0];
    setSettings(found);

    const values = (found?.values || {}) as TipDistributionValues;
    setRoleRows((values.roles || []).map((item) => ({
      role_id: normalizeId(item.role_id),
      weight: Number(item.weight || 0),
    })));
    setUserRows((values.users || []).map((item) => ({
      user_id: normalizeId(item.user_id),
      weight: Number(item.weight || 0),
    })));
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const payload: TipDistributionValues = {
        roles: roleRows
          .filter((row) => !!row.role_id)
          .map((row) => ({ role_id: normalizeId(row.role_id), weight: Number(row.weight || 0) })),
        users: userRows
          .filter((row) => !!row.user_id)
          .map((row) => ({ user_id: normalizeId(row.user_id), weight: Number(row.weight || 0) })),
      };

      if (settings?.id) {
        await db.merge(settings.id, {
          values: payload,
        });
      } else {
        await db.create(Tables.settings, {
          key: "tip_distribution",
          is_global: true,
          values: payload,
        });
      }

      toast.success(t('toast:admin.tipDistributionSaved'));
      await loadSettings();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 grid grid-cols-2 gap-5">
      <div className="shadow p-4 rounded bg-white">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">{t('forms.byRoles')}</h3>
          <Button
            variant="primary"
            icon={faPlus}
            onClick={() => {
              setRoleRows((prev) => [
                ...prev,
                { role_id: "", weight: 0 },
              ]);
            }}
          >
            {t('forms.roleWeight')}
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          {roleRows.length === 0 && (
            <div className="text-sm text-neutral-500">{t('forms.noRoleWeight')}</div>
          )}
          {roleRows.map((row, index) => (
            <div key={`role-${index}`} className="grid grid-cols-3 gap-3 items-end">
              <div>
                <label>{t('columns.role')}</label>
                <ReactSelect
                  value={row.role_id ? {
                    value: normalizeId(row.role_id),
                    label: normalizeText(roleData?.data?.find(item => normalizeId(item.id) === normalizeId(row.role_id))?.name) || normalizeId(row.role_id)
                  } : null}
                  onChange={(option: any) => {
                    setRoleRows(prev => prev.map((item, i) => i === index ? {
                      ...item,
                      role_id: normalizeId(option?.value),
                    } : item));
                  }}
                  options={(roleData?.data || []).map(item => ({
                    label: normalizeText(item.name),
                    value: normalizeId(item.id),
                  }))}
                  isClearable
                />
              </div>
              <div>
                <Input
                  label={t('forms.weight')}
                  type="number"
                  value={row.weight}
                  onChange={(event) => {
                    setRoleRows(prev => prev.map((item, i) => i === index ? {
                      ...item,
                      weight: Number(event.target.value || 0),
                    } : item));
                  }}
                />
              </div>
              <Button
                variant="danger"
                onClick={() => setRoleRows(prev => prev.filter((_, i) => i !== index))}
              >
                <FontAwesomeIcon icon={faTrash} />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="shadow p-4 rounded bg-white">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">{t('forms.specificUsers')}</h3>
          <Button
            variant="primary"
            icon={faPlus}
            onClick={() => {
              setUserRows((prev) => [
                ...prev,
                { user_id: "", weight: 0 },
              ]);
            }}
          >
            {t('forms.userWeight')}
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          {userRows.length === 0 && (
            <div className="text-sm text-neutral-500">{t('forms.noUserWeight')}</div>
          )}
          {userRows.map((row, index) => (
            <div key={`user-${index}`} className="grid grid-cols-3 gap-3 items-end">
              <div>
                <label>{t('tabs.users')}</label>
                <ReactSelect
                  value={row.user_id ? {
                    value: normalizeId(row.user_id),
                    label: (() => {
                      const user = userData?.data?.find(item => normalizeId(item.id) === normalizeId(row.user_id));
                      return user
                        ? `${normalizeText(user.first_name)} ${normalizeText(user.last_name)}`.trim()
                        : normalizeId(row.user_id);
                    })()
                  } : null}
                  onChange={(option: any) => {
                    setUserRows(prev => prev.map((item, i) => i === index ? {
                      ...item,
                      user_id: normalizeId(option?.value),
                    } : item));
                  }}
                  options={(userData?.data || []).map(item => ({
                    label: `${normalizeText(item.first_name)} ${normalizeText(item.last_name)}`.trim(),
                    value: normalizeId(item.id),
                  }))}
                  isClearable
                />
              </div>
              <div>
                <Input
                  label={t('forms.weight')}
                  type="number"
                  value={row.weight}
                  onChange={(event) => {
                    setUserRows(prev => prev.map((item, i) => i === index ? {
                      ...item,
                      weight: Number(event.target.value || 0),
                    } : item));
                  }}
                />
              </div>
              
              <Button
                variant="danger"
                onClick={() => setUserRows(prev => prev.filter((_, i) => i !== index))}
              >
                <FontAwesomeIcon icon={faTrash} />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="col-span-2">
        <Button variant="primary" onClick={saveSettings} isLoading={saving}>
          {t('forms.saveDistribution')}
        </Button>
      </div>
    </div>
  );
};
