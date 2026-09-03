import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useDB } from '@/api/db/db.ts';
import { Tables } from '@/api/db/tables.ts';
import { Setting } from '@/api/model/setting.ts';
import { Switch } from '@/components/common/input/switch.tsx';
import { TimeField } from '@/components/common/form/rhf-fields.tsx';
import { toast } from 'sonner';
import { useSecurity } from '@/hooks/useSecurity.ts';
import {
  AUTO_CLOCK_OUT_KEY,
  AutoClockOutSettings,
  DEFAULT_AUTO_CLOCK_OUT,
} from '@/api/model/auto_clock_out.ts';
import { useTranslation } from 'react-i18next';

interface FormValues {
  enabled: boolean;
  on_shift_end: boolean;
  on_defined_time: boolean;
  defined_time: string;
}

export const AutoClockOutSettingsCard = () => {
  const db = useDB();
  const [settings, setSettings] = useState<Setting>();
  const { protectFormSubmit } = useSecurity();
  const { t } = useTranslation(['settings', 'common']);

  const { control, handleSubmit, reset, watch } = useForm<FormValues>({
    defaultValues: {
      enabled: DEFAULT_AUTO_CLOCK_OUT.enabled,
      on_shift_end: DEFAULT_AUTO_CLOCK_OUT.on_shift_end,
      on_defined_time: DEFAULT_AUTO_CLOCK_OUT.on_defined_time,
      defined_time: DEFAULT_AUTO_CLOCK_OUT.defined_time,
    },
  });

  const enabled = watch('enabled');
  const onDefinedTime = watch('on_defined_time');

  const loadSettings = async () => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
      { key: AUTO_CLOCK_OUT_KEY }
    ) as [Setting[] | undefined];
    setSettings(rows?.[0]);
  };

  const saveSettings = async (values: FormValues) => {
    if (values.enabled && !values.on_shift_end && !values.on_defined_time) {
      toast.error(t('settings:autoClockOut.triggerRequired'));
      return;
    }

    const payload: AutoClockOutSettings = {
      enabled: Boolean(values.enabled),
      on_shift_end: Boolean(values.on_shift_end),
      on_defined_time: Boolean(values.on_defined_time),
      defined_time: values.defined_time || DEFAULT_AUTO_CLOCK_OUT.defined_time,
    };

    if (settings?.id) {
      await db.merge(settings.id, { values: payload });
    } else {
      await db.create(Tables.settings, {
        key: AUTO_CLOCK_OUT_KEY,
        is_global: true,
        values: payload,
      });
    }

    toast.success(t('settings:autoClockOut.updated'));
    await loadSettings();
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    if (!settings?.values) {
      return;
    }
    const values = settings.values as Partial<AutoClockOutSettings>;
    reset({
      enabled: values.enabled ?? DEFAULT_AUTO_CLOCK_OUT.enabled,
      on_shift_end: values.on_shift_end ?? DEFAULT_AUTO_CLOCK_OUT.on_shift_end,
      on_defined_time: values.on_defined_time ?? DEFAULT_AUTO_CLOCK_OUT.on_defined_time,
      defined_time: values.defined_time ?? DEFAULT_AUTO_CLOCK_OUT.defined_time,
    });
  }, [reset, settings]);

  return (
    <div className="shadow p-5 rounded-xl bg-white" data-testid="settings-card-auto-clock-out">
      <h2 className="text-xl font-semibold mb-1">{t('settings:autoClockOut.title')}</h2>
      <p className="text-sm text-neutral-500 mb-5">
        {t('settings:autoClockOut.description')}
      </p>
      <form
        onSubmit={protectFormSubmit(handleSubmit(saveSettings), {
          module: 'settings.auto_clock_out',
          description: t('settings:autoClockOut.saveDescription'),
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
            name="on_shift_end"
            control={control}
            render={({ field }) => (
              <Switch
                checked={!!field.value}
                onChange={field.onChange}
                disabled={!enabled}
              >
                {t('settings:autoClockOut.onShiftEnd')}
              </Switch>
            )}
          />
          <Controller
            name="on_defined_time"
            control={control}
            render={({ field }) => (
              <Switch
                checked={!!field.value}
                onChange={field.onChange}
                disabled={!enabled}
              >
                {t('settings:autoClockOut.onDefinedTime')}
              </Switch>
            )}
          />
          <TimeField
            name="defined_time"
            control={control}
            label={t('settings:autoClockOut.definedTime')}
            className={!enabled || !onDefinedTime ? 'opacity-50 pointer-events-none' : ''}
          />
        </div>
        <button className="btn btn-primary" type="submit">
          {t('common:actions.save')}
        </button>
      </form>
    </div>
  );
};
