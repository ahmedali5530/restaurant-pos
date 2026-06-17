import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import {Setting} from "@/api/model/setting.ts";
import {Input} from "@/components/common/input/input.tsx";
import {DiscountType} from "@/api/model/discount.ts";
import {toast} from "sonner";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {useTranslation} from 'react-i18next';

export const ServiceChargesSettings = () => {
  const db = useDB();
  const [settings, setSettings] = useState<Setting>();
  const {protectFormSubmit} = useSecurity();
  const { t } = useTranslation(['settings', 'common', 'toast']);


  const {control, handleSubmit, reset} = useForm();

  const normalizeType = (rawType: any): string => {
    if (rawType && typeof rawType === "object") {
      return rawType.value || rawType.label || DiscountType.Percent;
    }
    if (typeof rawType === "string") {
      return rawType;
    }
    return DiscountType.Percent;
  };

  const normalizeValue = (rawValue: any): number => {
    if (rawValue && typeof rawValue === "object") {
      return Number(rawValue.value ?? 0);
    }
    return Number(rawValue ?? 0);
  };

  const loadSettings = async () => {
    const [s] = await db.query(`SELECT * FROM ${Tables.settings} where key = $key and is_global = true FETCH values`, {
      key: 'service_charges'
    });

    setSettings(s![0]);
  }

  const saveSettings = async (values: any) => {
    const payload = {
      type: normalizeType(values?.type),
      value: normalizeValue(values?.value),
    };

    if (settings?.id) {
      await db.merge(settings.id, {
        values: payload
      });
    } else {
      await db.create(Tables.settings, {
        key: "service_charges",
        is_global: true,
        values: payload,
      });
    }

    toast.success(t('settings:serviceCharges.updated'));
  }

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if(settings){
      const serviceChargeType = normalizeType(settings.values?.type);
      reset({
        type: {
          label: serviceChargeType,
          value: serviceChargeType
        },
        value: normalizeValue(settings.values?.value)
      });
    }
  }, [reset, settings]);

  return (
    <div className="shadow p-5 rounded bg-white">
      <h2 className="text-xl font-semibold mb-1">{t('settings:serviceCharges.title')}</h2>
      <form onSubmit={protectFormSubmit((handleSubmit(saveSettings)), {
        module: 'Service charges',
        description: t('settings:serviceCharges.saveDescription')
      })}>
        <div className="grid grid-cols-2 gap-5 mb-5">
          <Controller
            render={({field}) => (
              <div>
                <label htmlFor="type">{t('common:actions.type')}</label>
                <ReactSelect
                  options={[DiscountType.Fixed, DiscountType.Percent].map(a => {
                    return {
                      label: a,
                      value: a
                    }
                  })}
                  value={field.value}
                  onChange={field.onChange}
                />
              </div>
            )}
            name="type"
            control={control}
          />
          <div>
            <Controller
              render={({field}) => (
                <Input
                  label={t('common:actions.value')}
                  value={field.value}
                  onChange={field.onChange}
                  type="number"
                />
              )}
              name="value"
              control={control}
            />

          </div>

        </div>
        <button className="btn btn-primary" type="submit">{t('common:actions.save')}</button>
      </form>
    </div>
  );
}
