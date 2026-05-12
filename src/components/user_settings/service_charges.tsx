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

export const ServiceChargesSettings = () => {
  const db = useDB();
  const [settings, setSettings] = useState<Setting>();
  const {protectFormSubmit} = useSecurity();


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

    toast.success("Service charges updated");
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
      <h2 className="text-xl font-semibold mb-1">Service charges</h2>
      <form onSubmit={protectFormSubmit((handleSubmit(saveSettings)), {
        module: 'Service charges',
        description: 'Save service charges'
      })}>
        <div className="grid grid-cols-2 gap-5 mb-5">
          <Controller
            render={({field}) => (
              <div>
                <label htmlFor="type">Type</label>
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
                  label="Value"
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
        <button className="btn btn-primary" type="submit">Save</button>
      </form>
    </div>
  );
}