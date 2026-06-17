import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import { Setting } from "@/api/model/setting.ts";
import { Switch } from "@/components/common/input/switch.tsx";
import { toast } from "sonner";
import { useSecurity } from "@/hooks/useSecurity.ts";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { PaymentType } from "@/api/model/payment_type.ts";
import {
  AUTO_CHECK_CLOSE_KEY,
  AutoCheckCloseSettings,
  DEFAULT_AUTO_CHECK_CLOSE,
} from "@/api/model/auto_check_close.ts";
import {toRecordId} from "@/lib/utils.ts";
import {useTranslation} from 'react-i18next';
interface FormValues {
  enabled: boolean;
  payment_type: { label: string; value: string } | null;
  print_on_close: boolean;
}

export const AutoCheckCloseSettingsCard = () => {
  const db = useDB();
  const [settings, setSettings] = useState<Setting>();
  const { protectFormSubmit } = useSecurity();
  const { t } = useTranslation(['settings', 'common']);

  const { data: paymentTypesData } = useApi<SettingsData<PaymentType>>(
    Tables.payment_types,
    ['deleted_at = none'],
    ['priority asc'],
    0,
    99999
  );

  const paymentTypeOptions = useMemo(() => {
    return (paymentTypesData?.data ?? [])
      .filter((pt) => pt.type !== 'remote')
      .map((pt) => ({
        label: pt.name,
        value: pt.id.toString(),
      }));
  }, [paymentTypesData]);

  const { control, handleSubmit, reset, watch } = useForm<FormValues>({
    defaultValues: {
      enabled: DEFAULT_AUTO_CHECK_CLOSE.enabled,
      payment_type: null,
      print_on_close: DEFAULT_AUTO_CHECK_CLOSE.print_on_close,
    },
  });

  const enabled = watch('enabled');

  const loadSettings = async () => {
    const [rows] = await db.query<Setting[]>(
      `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true`,
      { key: AUTO_CHECK_CLOSE_KEY }
    );
    setSettings(rows?.[0]);
  };

  const saveSettings = async (values: FormValues) => {
    if (values.enabled && !values.payment_type?.value) {
      toast.error(t('settings:autoCheckClose.paymentTypeRequired'));
      return;
    }

    const existing = (settings?.values ?? {}) as AutoCheckCloseSettings;
    const payload: AutoCheckCloseSettings = {
      enabled: values.enabled,
      payment_type_id: values.payment_type?.value ? toRecordId(values.payment_type.value) : null,
      print_on_close: values.print_on_close,
      last_closed_cycle: existing.last_closed_cycle,
    };

    if (settings?.id) {
      await db.merge(settings.id, { values: payload });
    } else {
      await db.create(Tables.settings, {
        key: AUTO_CHECK_CLOSE_KEY,
        is_global: true,
        values: payload,
      });
    }

    toast.success(t('settings:autoCheckClose.updated'));
    await loadSettings();
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    if (!settings) {
      return;
    }

    const values = {
      ...DEFAULT_AUTO_CHECK_CLOSE,
      ...(settings.values as AutoCheckCloseSettings),
    };
    const selectedPaymentTypeId = String(
      ((values.payment_type_id as {id?: unknown})?.id ?? values.payment_type_id ?? "")
    );

    const paymentOption = paymentTypeOptions.find(
      (opt) => opt.value === selectedPaymentTypeId
    );

    reset({
      enabled: values.enabled,
      payment_type: paymentOption ?? null,
      print_on_close: values.print_on_close,
    });
  }, [settings, paymentTypeOptions, reset]);

  return (
    <div className="shadow p-5 rounded bg-white">
      <h2 className="text-xl font-semibold mb-1">{t('settings:autoCheckClose.title')}</h2>
      <p className="text-sm text-neutral-500 mb-5">
        {t('settings:autoCheckClose.description')}
      </p>
      <form
        onSubmit={protectFormSubmit(handleSubmit(saveSettings), {
          module: 'Auto check close',
          description: t('settings:autoCheckClose.saveDescription'),
        })}
      >
        <div className="grid grid-cols-2 gap-5 mb-5">
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
            name="print_on_close"
            control={control}
            render={({ field }) => (
              <Switch checked={!!field.value} onChange={field.onChange}>
                {t('settings:autoCheckClose.printOnClose')}
              </Switch>
            )}
          />
          <Controller
            name="payment_type"
            control={control}
            rules={{ required: enabled ? t('settings:autoCheckClose.paymentTypeRequiredField') : false }}
            render={({ field }) => (
              <div>
                <label>{t('settings:autoCheckClose.paymentType')}</label>
                <ReactSelect
                  options={paymentTypeOptions}
                  value={field.value}
                  onChange={field.onChange}
                  isDisabled={!enabled}
                />
              </div>
            )}
          />
        </div>
        <button className="btn btn-primary" type="submit">
          {t('common:actions.save')}
        </button>
      </form>
    </div>
  );
};
