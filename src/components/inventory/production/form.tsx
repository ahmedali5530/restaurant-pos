import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {Controller, useForm} from "react-hook-form";
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
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {Recipe} from "@/api/model/recipe.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {
  completeProductionBatch,
  listRecipes,
  previewProductionBatch,
} from "@/lib/inventory/production.service.ts";
import {ScaledRecipeResult} from "@/lib/inventory/production.calculations.ts";
import {recordToString} from "@/api/reports/shared/records.ts";

type SelectOption = {label: string; value: string} | null;

interface ProductionFormValues {
  recipe: SelectOption;
  store: SelectOption;
  producedQty: number | string;
  batchNumber?: string;
  notes?: string;
  updateItemCost: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const selectOptionSchema = yup.object({
  label: yup.string(),
  value: yup.string(),
});

const validationSchema = yup.object({
  recipe: selectOptionSchema.required().nullable(),
  store: selectOptionSchema.required().nullable(),
  producedQty: yup.number().typeError("Number required").positive().required(),
  batchNumber: yup.string().nullable().optional(),
  notes: yup.string().nullable().optional(),
  updateItemCost: yup.boolean().default(false),
});

export const ProductionForm = ({open, onClose}: Props) => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const dbRef = useRef(db);
  const [state] = useAtom(appPage);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<ScaledRecipeResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [recipeList, setRecipeList] = useState<Recipe[]>([]);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  const {data: stores, fetchData: fetchStores} = useApi<SettingsData<InventoryStore>>(
    Tables.inventory_stores,
    [],
    [],
    0,
    9999,
    [],
    {enabled: false}
  );

  useEffect(() => {
    if (open) {
      fetchStores();
      listRecipes(dbRef.current, {page: 0, pageSize: 9999, activeOnly: true})
        .then((result) => setRecipeList(result.data))
        .catch(() => setRecipeList([]));
    }
  }, [open, fetchStores]);

  const recipeOptions = useMemo(
    () =>
      recipeList.map((recipe) => ({
        label: recipe.code ? `${recipe.name} (${recipe.code})` : recipe.name,
        value: recordToString(recipe.id) ?? "",
      })),
    [recipeList]
  );

  const storeOptions = useMemo(
    () =>
      stores?.data?.map((store) => ({
        label: store.name,
        value: recordToString(store.id) ?? "",
      })) ?? [],
    [stores]
  );

  const {
    control,
    register,
    handleSubmit,
    formState: {errors},
    reset,
    watch,
  } = useForm<ProductionFormValues>({
    resolver: yupResolver(validationSchema) as any,
    defaultValues: {
      recipe: null,
      store: null,
      producedQty: 1,
      batchNumber: "",
      notes: "",
      updateItemCost: false,
    },
  });

  const recipeValue = watch("recipe");
  const producedQty = watch("producedQty");

  const loadPreview = useCallback(async () => {
    if (!recipeValue?.value || !producedQty || Number(producedQty) <= 0) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await previewProductionBatch(
        dbRef.current,
        recipeValue.value,
        Number(producedQty)
      );
      setPreview(result);
    } catch (err) {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [recipeValue?.value, producedQty]);

  useEffect(() => {
    if (open) loadPreview();
  }, [open, loadPreview]);

  const onSubmit = async (values: ProductionFormValues) => {
    if (!state.user?.id || !values.recipe?.value || !values.store?.value) return;
    setSubmitting(true);
    try {
      await completeProductionBatch(
        db,
        {
          recipeId: values.recipe.value,
          storeId: values.store.value,
          producedQty: Number(values.producedQty),
          batchNumber: values.batchNumber,
          notes: values.notes,
          updateItemCost: values.updateItemCost,
        },
        recordToString(state.user.id)!
      );
      toast.success(t("production.batchCompleted"));
      reset();
      setPreview(null);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("production.batchFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("production.runProduction")} size="xl">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm">{t("production.recipe")}</label>
            <Controller
              control={control}
              name="recipe"
              render={({field}) => (
                <ReactSelect value={field.value} onChange={field.onChange} options={recipeOptions} />
              )}
            />
            <InputError error={errors.recipe?.message} />
          </div>
          <div>
            <label className="text-sm">{t("columns.stores")}</label>
            <Controller
              control={control}
              name="store"
              render={({field}) => (
                <ReactSelect value={field.value} onChange={field.onChange} options={storeOptions} />
              )}
            />
            <InputError error={errors.store?.message} />
          </div>
          <div>
            <Input
              type="number"
              step="any"
              label={t("production.producedQty")}
              {...register("producedQty")}
              error={errors.producedQty?.message}
            />
          </div>
          <div>
            <Input
              label={t("production.batchNumber")}
              {...register("batchNumber")}
              placeholder={t("production.batchNumberAuto")}
            />
          </div>
        </div>

        <Input label={t("production.notes")} {...register("notes")} />

        <Controller
          control={control}
          name="updateItemCost"
          render={({field: {value, onChange, ...field}}) => (
            <Checkbox
              {...field}
              checked={value}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
              label={t("production.updateItemCost")}
            />
          )}
        />

        <div className="border rounded-lg p-4 bg-neutral-50">
          <h4 className="font-medium mb-2">{t("production.preview")}</h4>
          {previewLoading && <p className="text-sm text-neutral-500">{t("common:loading")}</p>}
          {!previewLoading && preview && (
            <>
              <p className="text-sm mb-2">
                {t("production.scaleFactor")}: {preview.scaleFactor} |{" "}
                {t("production.yieldLoss")}: {preview.yieldLossPercent}% |{" "}
                {t("production.totalInputCost")}: {preview.totalInputCost}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h5 className="text-sm font-medium">{t("production.requiredInputs")}</h5>
                  <ul className="text-sm list-disc pl-4">
                    {preview.inputs.map((line) => (
                      <li key={line.itemId}>
                        {line.itemName ?? line.itemId}: {line.quantity} ({line.totalCost})
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h5 className="text-sm font-medium">{t("production.expectedOutputs")}</h5>
                  <ul className="text-sm list-disc pl-4">
                    {preview.outputs.map((line) => (
                      <li key={line.itemId}>
                        {line.itemName ?? line.itemId}: {line.quantity}{" "}
                        [{line.disposition}] cost: {line.allocatedCost}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={submitting || !preview}>
            {t("production.confirmBatch")}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
