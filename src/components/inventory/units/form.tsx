import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {Controller, useForm} from "react-hook-form";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {
  UOM_FAMILY_BASE_CODE,
  type InventoryUomFamily,
  type InventoryUomRecord,
} from "@/api/model/inventory_uom.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {Switch} from "@/components/common/input/switch.tsx";
import {countItemsUsingUom} from "@/lib/inventory/uom.catalog.ts";

interface FormValues {
  code: string;
  name: string;
  family: {label: string; value: InventoryUomFamily} | null;
  base_factor: number;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  data?: InventoryUomRecord;
}

export const InventoryUomForm = ({open, onClose, onSaved, data}: Props) => {
  const {t} = useTranslation(["inventory", "common"]);
  const db = useDB();
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(data?.id || data?.code);
  const isSystem = Boolean(data?.is_system);

  const familyOptions = useMemo(
    () =>
      (["weight", "volume", "count", "pack"] as InventoryUomFamily[]).map((value) => ({
        label: t(`uom.families.${value}`),
        value,
      })),
    [t]
  );

  const validationSchema: yup.ObjectSchema<FormValues> = useMemo(
    () =>
      yup
        .object({
          code: yup
            .string()
            .required(t("uom.validation.required"))
            .matches(/^[A-Za-z][A-Za-z0-9_]{0,15}$/, t("uom.validation.codeFormat")),
          name: yup.string().required(t("uom.validation.required")),
          family: yup
            .object({
              label: yup.string().required(),
              value: yup
                .mixed<InventoryUomFamily>()
                .oneOf(["weight", "volume", "count", "pack"])
                .required(),
            })
            .nullable()
            .required(t("uom.validation.required")),
          base_factor: yup
            .number()
            .typeError(t("uom.validation.number"))
            .positive(t("uom.validation.factorPositive"))
            .required(t("uom.validation.required")),
          is_active: yup.boolean().required(),
        })
        .required(),
    [t]
  );

  const {
    handleSubmit,
    formState: {errors},
    reset,
    control,
    watch,
  } = useForm<FormValues>({
    resolver: yupResolver(validationSchema),
    defaultValues: {
      code: "",
      name: "",
      family: null,
      base_factor: 1,
      is_active: true,
    },
  });

  const watchedFamily = watch("family");
  const watchedFactor = watch("base_factor");
  const watchedCode = watch("code");
  const baseCode = watchedFamily?.value
    ? UOM_FAMILY_BASE_CODE[watchedFamily.value]
    : null;

  useEffect(() => {
    if (!open) return;
    if (data) {
      reset({
        code: data.code,
        name: data.name,
        family: {
          label: t(`uom.families.${data.family}`),
          value: data.family,
        },
        base_factor: data.base_factor,
        is_active: data.is_active,
      });
    } else {
      reset({
        code: "",
        name: "",
        family: null,
        base_factor: 1,
        is_active: true,
      });
    }
  }, [open, data, reset, t]);

  const closeModal = () => {
    onClose();
  };

  const onSubmit = async (values: FormValues) => {
    if (!values.family) return;
    setSaving(true);
    try {
      const code = values.code.trim().toUpperCase();
      const family = values.family.value;
      const base_factor = Number(values.base_factor);
      const is_active = Boolean(values.is_active);

      if (!is_active && data?.is_active) {
        const used = await countItemsUsingUom(db, code);
        if (used > 0) {
          toast.error(t("uom.errors.inUse", {count: used, code}));
          setSaving(false);
          return;
        }
      }

      if (isEdit && data) {
        const factorChanged = Number(data.base_factor) !== base_factor;
        const payload: Record<string, unknown> = {
          name: values.name.trim() || code,
          base_factor,
          is_active,
        };
        if (!isSystem) {
          payload.code = code;
          payload.family = family;
        }
        const recordId = data.id ?? `${Tables.inventory_uoms}:${data.code}`;
        await db.update(recordId, payload);
        if (factorChanged) {
          toast.warning(t("uom.warnings.factorChange"));
        }
        toast.success(t("uom.toast.saved", {code}));
      } else {
        const existingResult = await db.query(
          `SELECT id FROM ${Tables.inventory_uoms} WHERE code = $code LIMIT 1`,
          {code}
        );
        const existingRows = Array.isArray(existingResult?.[0]) ? existingResult[0] : [];
        if (existingRows.length > 0) {
          toast.error(t("uom.errors.duplicateCode", {code}));
          setSaving(false);
          return;
        }
        await db.query(
          `UPSERT type::record($table, $code) SET
            code = $code,
            name = $name,
            family = $family,
            base_factor = $base_factor,
            is_system = false,
            is_active = $is_active,
            sort = $sort`,
          {
            table: Tables.inventory_uoms,
            code,
            name: values.name.trim() || code,
            family,
            base_factor,
            is_active,
            sort: 900,
          }
        );
        toast.success(t("uom.toast.saved", {code}));
      }

      onSaved();
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? t("uom.form.editTitle", {code: data?.code}) : t("uom.form.createTitle")}
      open={open}
      onClose={closeModal}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3 mb-3">
          <div>
            <Controller
              name="code"
              control={control}
              render={({field}) => (
                <Input
                  label={t("columns.code")}
                  value={field.value}
                  onChange={(e) =>
                    field.onChange(
                      isSystem ? field.value : String(e.target.value).toUpperCase()
                    )
                  }
                  disabled={isSystem}
                  error={errors?.code?.message}
                  autoFocus={!isEdit}
                />
              )}
            />
          </div>
          <div>
            <Controller
              name="name"
              control={control}
              render={({field}) => (
                <Input
                  label={t("columns.name")}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors?.name?.message}
                />
              )}
            />
          </div>
          <div>
            <label className="text-sm">{t("uom.columns.family")}</label>
            <Controller
              name="family"
              control={control}
              render={({field}) => (
                <ReactSelect
                  options={familyOptions}
                  value={field.value}
                  onChange={field.onChange}
                  isDisabled={isSystem}
                />
              )}
            />
            {errors?.family?.message && (
              <div className="text-danger-500 text-sm">{String(errors.family.message)}</div>
            )}
          </div>
          <div>
            <Controller
              name="base_factor"
              control={control}
              render={({field}) => (
                <Input
                  type="number"
                  step="any"
                  label={t("uom.columns.baseFactor")}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors?.base_factor?.message}
                />
              )}
            />
            {baseCode && Number.isFinite(Number(watchedFactor)) && (
              <p className="text-sm text-neutral-500 mt-1">
                {t("uom.factorHint", {
                  code: (watchedCode || "X").toUpperCase() || "X",
                  factor: watchedFactor,
                  base: baseCode,
                })}
              </p>
            )}
          </div>
          <div className="flex items-center">
            <Controller
              name="is_active"
              control={control}
              render={({field}) => (
                <div>
                  <Switch
                    checked={!!field.value}
                    onChange={(e) =>
                      field.onChange((e.target as HTMLInputElement).checked)
                    }
                  >
                    {t("uom.columns.active")}
                  </Switch>
                </div>
              )}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={closeModal} variant="neutral">
            {t("common:actions.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {t("common:actions.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
