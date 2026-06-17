import {useEffect, useState} from "react";
import {Controller, useForm} from "react-hook-form";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Setting} from "@/api/model/setting.ts";
import {Input} from "@/components/common/input/input.tsx";
import {Switch} from "@/components/common/input/switch.tsx";
import {toast} from "sonner";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {CLOSING_CYCLE_KEY} from "@/lib/closing-cycle.ts";
import {useTranslation} from 'react-i18next';

interface ClosingCycleValues {
  enabled: boolean;
  start_time: string;
  end_time: string;
}

const DEFAULT_VALUES: ClosingCycleValues = {
  enabled: true,
  start_time: "06:00",
  end_time: "02:00",
};

export const ClosingCycleSettingsCard = () => {
  const db = useDB();
  const [settings, setSettings] = useState<Setting>();
  const {protectFormSubmit} = useSecurity();
  const { t } = useTranslation(['settings', 'common']);

  const {control, handleSubmit, reset} = useForm<ClosingCycleValues>({
    defaultValues: DEFAULT_VALUES,
  });

  const loadSettings = async () => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true`,
      {key: CLOSING_CYCLE_KEY}
    ) as [Setting[] | undefined];
    setSettings(rows?.[0]);
  };

  const saveSettings = async (values: ClosingCycleValues) => {
    const payload: ClosingCycleValues = {
      enabled: Boolean(values.enabled),
      start_time: values.start_time || DEFAULT_VALUES.start_time,
      end_time: values.end_time || DEFAULT_VALUES.end_time,
    };

    if (settings?.id) {
      await db.merge(settings.id, {values: payload});
    } else {
      await db.create(Tables.settings, {
        key: CLOSING_CYCLE_KEY,
        is_global: true,
        values: payload,
      });
    }

    toast.success(t('settings:closingCycle.updated'));
    await loadSettings();
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    if (!settings?.values) {
      return;
    }
    const values = settings.values as Partial<ClosingCycleValues>;
    reset({
      enabled: values.enabled ?? DEFAULT_VALUES.enabled,
      start_time: values.start_time ?? DEFAULT_VALUES.start_time,
      end_time: values.end_time ?? DEFAULT_VALUES.end_time,
    });
  }, [reset, settings]);

  return (
    <div className="shadow p-5 rounded bg-white">
      <h2 className="text-xl font-semibold mb-1">{t('settings:closingCycle.title')}</h2>
      <p className="text-sm text-neutral-500 mb-5">
        {t('settings:closingCycle.description')}
      </p>
      <form onSubmit={protectFormSubmit(handleSubmit(saveSettings), {
        module: "Closing cycle",
        description: t('settings:closingCycle.saveDescription'),
      })}>
        <div className="grid grid-cols-2 gap-5 mb-5">
          <Controller
            name="enabled"
            control={control}
            render={({field}) => (
              <Switch checked={!!field.value} onChange={field.onChange}>
                {t('common:actions.enabled')}
              </Switch>
            )}
          />
          <div/>
          <Controller
            name="start_time"
            control={control}
            render={({field}) => (
              <Input
                label={t('settings:closingCycle.startTime')}
                type="time"
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            name="end_time"
            control={control}
            render={({field}) => (
              <Input
                label={t('settings:closingCycle.endTime')}
                type="time"
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </div>
        <button className="btn btn-primary" type="submit">{t('common:actions.save')}</button>
      </form>
    </div>
  );
};
