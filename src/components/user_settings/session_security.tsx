import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { useDB } from '@/api/db/db.ts';
import { Tables } from '@/api/db/tables.ts';
import { Setting } from '@/api/model/setting.ts';
import {
  DEFAULT_SESSION_SECURITY,
  MIN_IDLE_MINUTES,
  SESSION_SECURITY_CHANGED_EVENT,
  SESSION_SECURITY_KEY,
  SessionSecurityAction,
  SessionSecuritySettings,
  normalizeIdleMinutes,
  normalizeSessionSecurity,
} from '@/api/model/session_security.ts';
import { Switch } from '@/components/common/input/switch.tsx';
import { Input } from '@/components/common/input/input.tsx';
import { Button } from '@/components/common/input/button.tsx';
import { toast } from 'sonner';
import { useSecurity } from '@/hooks/useSecurity.ts';
import { appPage } from '@/store/jotai.ts';
import { cn, toRecordId } from '@/lib/utils.ts';

interface FormValues {
  enabled: boolean;
  idle_minutes: number;
  idle_action: SessionSecurityAction;
}

const recordIdString = (value: unknown): string => {
  if (value == null) return '';
  let s = '';
  if (typeof value === 'string') {
    s = value;
  } else if (typeof value === 'object' && value !== null && 'toString' in value) {
    s = String((value as { toString: () => string }).toString());
  } else {
    s = String(value);
  }
  return s.includes(':') ? s.slice(s.indexOf(':') + 1) : s;
};

export const SessionSecuritySettingsCard = () => {
  const db = useDB();
  const [page] = useAtom(appPage);
  const [settings, setSettings] = useState<Setting>();
  const { protectFormSubmit } = useSecurity();
  const { t } = useTranslation(['settings', 'common']);

  const userId = page?.user?.id != null ? recordIdString(page.user.id) : null;

  const { control, handleSubmit, reset, watch } = useForm<FormValues>({
    defaultValues: {
      enabled: DEFAULT_SESSION_SECURITY.enabled,
      idle_minutes: DEFAULT_SESSION_SECURITY.idle_minutes,
      idle_action: DEFAULT_SESSION_SECURITY.idle_action,
    },
  });

  const enabled = watch('enabled');
  const idleAction = watch('idle_action');

  const loadSettings = async () => {
    if (!userId) {
      setSettings(undefined);
      return;
    }

    const [raw] = await db.query(
      `SELECT * FROM ${Tables.settings} WHERE key = $key`,
      { key: SESSION_SECURITY_KEY }
    );
    const rows = (Array.isArray(raw) ? raw : []) as Setting[];
    const userRow = rows.find((r) => recordIdString(r?.user) === recordIdString(userId));
    setSettings(userRow);
  };

  const saveSettings = async (values: FormValues) => {
    if (!userId) {
      toast.error(t('settings:sessionSecurity.loginRequired'));
      return;
    }

    const payload: SessionSecuritySettings = {
      enabled: Boolean(values.enabled),
      idle_minutes: normalizeIdleMinutes(values.idle_minutes),
      idle_action: values.idle_action === 'logout' ? 'logout' : 'lock',
    };

    if (settings?.id) {
      await db.merge(toRecordId(settings.id), { values: payload });
    } else {
      await db.create(Tables.settings, {
        key: SESSION_SECURITY_KEY,
        user: toRecordId(userId),
        values: payload,
      });
    }

    toast.success(t('settings:sessionSecurity.updated'));
    window.dispatchEvent(new Event(SESSION_SECURITY_CHANGED_EVENT));
    await loadSettings();
  };

  useEffect(() => {
    void loadSettings();
  }, [userId]);

  useEffect(() => {
    const values = normalizeSessionSecurity(
      (settings?.values ?? {}) as Partial<SessionSecuritySettings>
    );
    reset({
      enabled: values.enabled,
      idle_minutes: values.idle_minutes,
      idle_action: values.idle_action,
    });
  }, [settings, reset]);

  return (
    <div className="shadow p-5 rounded-xl bg-white" data-testid="settings-card-session-security">
      <h2 className="text-xl font-semibold mb-1">{t('settings:sessionSecurity.title')}</h2>
      <p className="text-sm text-neutral-500 mb-5">
        {t('settings:sessionSecurity.description')}
      </p>
      <form
        onSubmit={protectFormSubmit(handleSubmit(saveSettings), {
          module: 'settings.session_security',
          description: t('settings:sessionSecurity.saveDescription'),
        })}
      >
        <div className="grid grid-cols-1 gap-5 mb-5">
          <Controller
            name="enabled"
            control={control}
            render={({ field }) => (
              <Switch checked={!!field.value} onChange={field.onChange}>
                {t('common:actions.enabled')}
              </Switch>
            )}
          />
          <Controller
            name="idle_minutes"
            control={control}
            rules={{
              required: enabled,
              min: MIN_IDLE_MINUTES,
            }}
            render={({ field }) => (
              <div>
                <Input
                  type="number"
                  min={MIN_IDLE_MINUTES}
                  step={0.1}
                  decimalScale={2}
                  allowNegative={false}
                  label={t('settings:sessionSecurity.idleMinutes')}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                  disabled={!enabled}
                />
              </div>
            )}
          />
          <div>
            <label className="block font-bold mb-2">
              {t('settings:sessionSecurity.action')}
            </label>
            <Controller
              name="idle_action"
              control={control}
              render={({ field }) => (
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    disabled={!enabled}
                    variant={idleAction === 'lock' ? 'primary' : undefined}
                    className={cn(idleAction !== 'lock' && 'btn-light')}
                    onClick={() => field.onChange('lock')}
                  >
                    {t('settings:sessionSecurity.actionLock')}
                  </Button>
                  <Button
                    type="button"
                    disabled={!enabled}
                    variant={idleAction === 'logout' ? 'danger' : undefined}
                    className={cn(idleAction !== 'logout' && 'btn-light')}
                    onClick={() => field.onChange('logout')}
                  >
                    {t('settings:sessionSecurity.actionLogout')}
                  </Button>
                </div>
              )}
            />
          </div>
        </div>
        <button className="btn btn-primary" type="submit">
          {t('common:actions.save')}
        </button>
      </form>
    </div>
  );
};
