import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {Controller, useFieldArray, useForm} from "react-hook-form";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input, InputError} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {Recipe} from "@/api/model/recipe.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import _ from "lodash";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {
  createRecipe,
  RecipeInput,
  updateRecipe,
} from "@/lib/inventory/production.service.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {Radio} from "@/components/common/input/radio.tsx";

type SelectOption = {label: string; value: string} | null;

interface RecipeItemFormValue {
  item: SelectOption;
  quantity: number | string;
}

interface RecipeOutputFormValue {
  item: SelectOption;
  yieldPercent: number | string;
  disposition: SelectOption;
  valueWeight: number | string;
  isPrimary: boolean;
}

interface RecipeFormValues {
  name: string;
  code?: string;
  notes?: string;
  isActive: boolean;
  baseBatchQty: number | string;
  costAllocation: SelectOption;
  items: RecipeItemFormValue[];
  outputs: RecipeOutputFormValue[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: Recipe;
}

const selectOptionSchema = yup.object({
  label: yup.string(),
  value: yup.string(),
});

const validationSchema = yup.object({
  name: yup.string().required(),
  code: yup.string().nullable().optional(),
  notes: yup.string().nullable().optional(),
  isActive: yup.boolean().default(true),
  baseBatchQty: yup.number().typeError("Number required").positive().required(),
  costAllocation: selectOptionSchema.required().nullable(),
  items: yup.array().of(
    yup.object({
      item: selectOptionSchema.required().nullable(),
      quantity: yup.number().typeError("Number required").positive().required(),
    })
  ).min(1),
  outputs: yup.array().of(
    yup.object({
      item: selectOptionSchema.required().nullable(),
      yieldPercent: yup.number().typeError("Number required").positive().required(),
      disposition: selectOptionSchema.required().nullable(),
      valueWeight: yup.number().typeError("Number required").min(0).required(),
      isPrimary: yup.boolean().default(false),
    })
  ).min(1).test("one-primary", "Exactly one primary output required", (outputs) => {
    if (!outputs?.length) return false;
    return outputs.filter((o) => o?.isPrimary).length === 1;
  }),
});

const toRecordIdString = (id: unknown): string => {
  if (!id) return "";
  return recordToString(id) ?? String(id);
};

export const RecipeForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [state] = useAtom(appPage);
  const [submitting, setSubmitting] = useState(false);

  const {
    data: items,
    fetchData: fetchItems,
    isFetching: loadingItems,
  } = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], [], 0, 9999, [], {
    enabled: false,
  });

  useEffect(() => {
    if (open) fetchItems();
  }, [open, fetchItems]);

  const itemOptions = useMemo(
    () =>
      items?.data?.map((item) => ({
        label: `${item.name}-${item.code}`,
        value: toRecordIdString(item.id),
      })) ?? [],
    [items]
  );

  const dispositionOptions = useMemo(
    () => [
      {label: t("production.dispositionInventory"), value: "inventory"},
      {label: t("production.dispositionWaste"), value: "waste"},
    ],
    [t]
  );

  const costAllocationOptions = useMemo(
    () => [
      {label: t("production.costAllocationYield"), value: "yield"},
      {label: t("production.costAllocationValue"), value: "value"},
    ],
    [t]
  );

  const defaultValues: RecipeFormValues = {
    name: "",
    code: "",
    notes: "",
    isActive: true,
    baseBatchQty: 1,
    costAllocation: costAllocationOptions[0],
    items: [{item: null, quantity: 1}],
    outputs: [{
      item: null,
      yieldPercent: 100,
      disposition: dispositionOptions[0],
      valueWeight: 1,
      isPrimary: true,
    }],
  };

  const {
    control,
    register,
    handleSubmit,
    formState: {errors},
    reset,
    watch,
    setValue,
  } = useForm<RecipeFormValues>({
    resolver: yupResolver(validationSchema) as any,
    defaultValues,
  });

  const {fields: itemFields, append: appendItem, remove: removeItem} = useFieldArray({
    control,
    name: "items",
  });

  const {fields: outputFields, append: appendOutput, remove: removeOutput} = useFieldArray({
    control,
    name: "outputs",
  });

  const outputs = watch("outputs");

  useEffect(() => {
    if (!open) return;
    if (data) {
      reset({
        name: data.name,
        code: data.code ?? "",
        notes: data.notes ?? "",
        isActive: data.is_active !== false,
        baseBatchQty: data.base_batch_qty,
        costAllocation:
          costAllocationOptions.find((o) => o.value === data.cost_allocation) ??
          costAllocationOptions[0],
        items: (data.items ?? []).map((line) => ({
          item: {
            label: `${line.item?.name}-${line.item?.code}`,
            value: toRecordIdString(line.item?.id ?? line.item),
          },
          quantity: line.quantity,
        })),
        outputs: (data.outputs ?? []).map((line) => ({
          item: {
            label: `${line.item?.name}-${line.item?.code}`,
            value: toRecordIdString(line.item?.id ?? line.item),
          },
          yieldPercent: line.yield_percent,
          disposition:
            dispositionOptions.find((o) => o.value === line.disposition) ??
            dispositionOptions[0],
          valueWeight: line.value_weight,
          isPrimary: line.is_primary,
        })),
      });
    } else {
      reset(defaultValues);
    }
  }, [open, data]);

  const setPrimaryOutput = (index: number) => {
    outputs?.forEach((_, i) => {
      setValue(`outputs.${i}.isPrimary`, i === index);
    });
  };

  const closeModal = () => {
    reset(defaultValues);
    onClose();
  };

  const buildPayload = (values: RecipeFormValues): RecipeInput => ({
    name: values.name,
    code: values.code,
    notes: values.notes,
    isActive: values.isActive,
    baseBatchQty: Number(values.baseBatchQty),
    costAllocation: (values.costAllocation?.value as "yield" | "value") ?? "yield",
    items: values.items.map((line, index) => ({
      itemId: line.item!.value,
      quantity: Number(line.quantity),
      sortOrder: index,
    })),
    outputs: values.outputs.map((line, index) => ({
      itemId: line.item!.value,
      yieldPercent: Number(line.yieldPercent),
      disposition: (line.disposition?.value as "inventory" | "waste") ?? "inventory",
      valueWeight: Number(line.valueWeight),
      isPrimary: line.isPrimary,
      sortOrder: index,
    })),
  });

  const onSubmit = async (values: RecipeFormValues) => {
    if (!state.user?.id) {
      toast.error(t("buffet.userRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const payload = buildPayload(values);
      const userId = toRecordIdString(state.user.id);
      if (data?.id) {
        await updateRecipe(db, toRecordIdString(data.id), payload);
        toast.success(t("production.recipeUpdated"));
      } else {
        await createRecipe(db, payload, userId);
        toast.success(t("production.recipeCreated"));
      }
      closeModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("production.recipeSaveFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={closeModal}
      title={data ? t("production.editRecipe") : t("production.createRecipe")}
      size="xl"
    >
      <form key={data?.id ?? "new"} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Input label={t("columns.name")} {...register("name")} error={errors.name?.message} />
          </div>
          <div>
            <Input label={t("columns.code")} {...register("code")} error={errors.code?.message} />
          </div>
          <div>
            <Input
              label={t("production.baseBatchQty")}
              type="number"
              step="any"
              {...register("baseBatchQty")}
              error={errors.baseBatchQty?.message}
            />
          </div>
          <div>
            <label className="text-sm">{t("production.costAllocation")}</label>
            <Controller
              control={control}
              name="costAllocation"
              render={({field}) => (
                <ReactSelect
                  value={field.value}
                  onChange={field.onChange}
                  options={costAllocationOptions}
                />
              )}
            />
          </div>
        </div>

        <Input label={t("production.notes")} {...register("notes")} />

        <Controller
          control={control}
          name="isActive"
          render={({field: {value, onChange, ...field}}) => (
            <Checkbox
              {...field}
              checked={value}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
              label={t("production.active")}
            />
          )}
        />

        <fieldset className="border rounded-lg p-3">
          <legend className="px-2">{t("production.inputs")}</legend>
          {itemFields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-12 gap-2 items-end mb-2">
              <div className="col-span-7">
                <Controller
                  control={control}
                  name={`items.${index}.item`}
                  render={({field: f}) => (
                    <ReactSelect
                      value={f.value}
                      onChange={f.onChange}
                      options={itemOptions}
                      isLoading={loadingItems}
                    />
                  )}
                />
                <InputError error={_.get(errors, ["items", index, "item", "message"])} />
              </div>
              <div className="col-span-3">
                <Input
                  type="number"
                  step="any"
                  label={t("forms.quantity")}
                  {...register(`items.${index}.quantity`)}
                  error={_.get(errors, ["items", index, "quantity", "message"])}
                />
              </div>
              <div className="col-span-2">
                <Button
                  type="button"
                  variant="danger"
                  iconButton
                  onClick={() => removeItem(index)}
                  disabled={itemFields.length <= 1}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            icon={faPlus}
            onClick={() => appendItem({item: null, quantity: 1})}
          >
            {t("production.addInput")}
          </Button>
        </fieldset>

        <fieldset className="border rounded-lg p-3">
          <legend className="px-2">{t("production.outputs")}</legend>
          {typeof errors.outputs === "object" && errors.outputs && "message" in errors.outputs && (
            <InputError error={errors.outputs.message as string} />
          )}
          {outputFields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-12 gap-2 items-end mb-2">
              <div className="col-span-4">
                <Controller
                  control={control}
                  name={`outputs.${index}.item`}
                  render={({field: f}) => (
                    <ReactSelect
                      value={f.value}
                      onChange={f.onChange}
                      options={itemOptions}
                      isLoading={loadingItems}
                    />
                  )}
                />
              </div>
              <div className="col-span-2">
                <Controller
                  control={control}
                  name={`outputs.${index}.yieldPercent`}
                  render={({field}) => (
                    <Input
                      type="number"
                      step="any"
                      label={t("production.yieldPercent")}
                      name={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  )}
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm">{t("production.disposition")}</label>
                <Controller
                  control={control}
                  name={`outputs.${index}.disposition`}
                  render={({field: f}) => (
                    <ReactSelect value={f.value} onChange={f.onChange} options={dispositionOptions} />
                  )}
                />
              </div>
              <div className="col-span-2">
                <Controller
                  control={control}
                  name={`outputs.${index}.valueWeight`}
                  render={({field}) => (
                    <Input
                      type="number"
                      step="any"
                      label={t("production.valueWeight")}
                      name={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  )}
                />
              </div>
              <div className="col-span-1 flex flex-col items-center">
                <Radio
                  name="primaryOutput"
                  label={t("production.primary")}
                  checked={outputs?.[index]?.isPrimary ?? false}
                  onChange={() => setPrimaryOutput(index)}
                />
              </div>
              <div className="col-span-1">
                <Button
                  type="button"
                  variant="danger"
                  iconButton
                  onClick={() => removeOutput(index)}
                  disabled={outputFields.length <= 1}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            icon={faPlus}
            onClick={() =>
              appendOutput({
                item: null,
                yieldPercent: 10,
                disposition: dispositionOptions[0],
                valueWeight: 1,
                isPrimary: false,
              })
            }
          >
            {t("production.addOutput")}
          </Button>
        </fieldset>

        <p className="text-sm text-neutral-600">{t("production.recipeHint")}</p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={closeModal}>
            {t("common:actions.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {t("common:actions.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
