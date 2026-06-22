import {useEffect, useMemo} from "react";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {Controller, useFieldArray, useForm} from "react-hook-form";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {BuffetMenu, BuffetSessionType} from "@/api/model/buffet_menu.ts";
import {Recipe} from "@/api/model/recipe.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {
  BuffetMenuInput,
  createBuffetMenu,
  updateBuffetMenu,
} from "@/lib/inventory/buffet.service.ts";
import {recordToString} from "@/api/reports/shared/records.ts";

type SelectOption = {label: string; value: string} | null;

interface MenuItemFormValue {
  recipe: SelectOption;
  perGuestQty: number | string;
}

interface BuffetMenuFormValues {
  name: string;
  code?: string;
  sessionType: SelectOption;
  isActive: boolean;
  notes?: string;
  items: MenuItemFormValue[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: BuffetMenu;
}

const selectOptionSchema = yup.object({
  label: yup.string(),
  value: yup.string(),
});

const validationSchema = yup.object({
  name: yup.string().required(),
  code: yup.string().nullable().optional(),
  sessionType: selectOptionSchema.required().nullable(),
  isActive: yup.boolean().default(true),
  notes: yup.string().nullable().optional(),
  items: yup.array().of(
    yup.object({
      recipe: selectOptionSchema.required().nullable(),
      perGuestQty: yup.number().typeError("Number required").positive().required(),
    })
  ).min(1),
});

export const BuffetMenuForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [state] = useAtom(appPage);

  const sessionTypeOptions = useMemo<SelectOption[]>(
    () => [
      {label: t("buffet.sessionTypes.breakfast"), value: "breakfast"},
      {label: t("buffet.sessionTypes.lunch"), value: "lunch"},
      {label: t("buffet.sessionTypes.dinner"), value: "dinner"},
    ],
    [t]
  );

  const {data: recipes} = useApi<SettingsData<Recipe>>(
    Tables.recipes,
    ["is_active = true"],
    ["name asc"],
    0,
    9999
  );

  const recipeOptions = useMemo(
    () =>
      recipes?.data?.map((recipe) => ({
        label: recipe.name,
        value: recordToString(recipe.id)!,
      })) ?? [],
    [recipes]
  );

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: {errors, isSubmitting},
  } = useForm<BuffetMenuFormValues>({
    resolver: yupResolver(validationSchema) as any,
    defaultValues: {
      name: "",
      code: "",
      sessionType: sessionTypeOptions[1],
      isActive: true,
      notes: "",
      items: [{recipe: null, perGuestQty: 1}],
    },
  });

  const {fields, append, remove} = useFieldArray({control, name: "items"});

  useEffect(() => {
    if (!data) return;
    reset({
      name: data.name,
      code: data.code ?? "",
      sessionType: sessionTypeOptions.find((o) => o?.value === data.session_type) ?? null,
      isActive: data.is_active,
      notes: data.notes ?? "",
      items: (data.items ?? []).map((item) => ({
        recipe: {
          label: item.recipe?.name ?? "",
          value: recordToString(item.recipe?.id ?? item.recipe)!,
        },
        perGuestQty: item.per_guest_qty,
      })),
    });
  }, [data, reset, sessionTypeOptions]);

  const onSubmit = async (values: BuffetMenuFormValues) => {
    const userId = recordToString(state?.user?.id);
    if (!userId) {
      toast.error(t("buffet.userRequired"));
      return;
    }

    const payload: BuffetMenuInput = {
      name: values.name,
      code: values.code,
      sessionType: (values.sessionType?.value ?? "lunch") as BuffetSessionType,
      isActive: values.isActive,
      notes: values.notes,
      items: values.items.map((item, index) => ({
        recipeId: item.recipe!.value,
        perGuestQty: Number(item.perGuestQty),
        sortOrder: index,
      })),
    };

    try {
      if (data?.id) {
        await updateBuffetMenu(db, recordToString(data.id)!, payload);
        toast.success(t("buffet.menuUpdated"));
      } else {
        await createBuffetMenu(db, payload, userId);
        toast.success(t("buffet.menuCreated"));
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("buffet.menuSaveFailed"));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={data ? t("buffet.editMenu") : t("buffet.createMenu")}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Input label={t("columns.name")} {...register("name")} error={errors.name?.message} />
          </div>
          <div>
            <Input label={t("columns.code")} {...register("code")} />
          </div>
        </div>

        <div>
          <label>{t("buffet.sessionType")}</label>
          <Controller
            control={control}
            name="sessionType"
            render={({field}) => (
              <ReactSelect
                options={sessionTypeOptions}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <p className="text-sm text-neutral-600 mt-1">{t("buffet.help.sessionTypeMenu")}</p>
        </div>

        <Input label={t("buffet.notes")} {...register("notes")} />

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

        <div>
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">{t("buffet.menuItems")}</h3>
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={faPlus}
              onClick={() => append({recipe: null, perGuestQty: 1})}
            >
              {t("buffet.addMenuItem")}
            </Button>
          </div>

          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-12 gap-2 mb-2 items-end">
              <div className="col-span-7">
                <label>{t("production.recipe")}</label>
                <Controller
                  control={control}
                  name={`items.${index}.recipe`}
                  render={({field: recipeField}) => (
                    <ReactSelect
                      options={recipeOptions}
                      value={recipeField.value}
                      onChange={recipeField.onChange}
                    />
                  )}
                />
                <p className="text-sm text-neutral-600 mt-1">{t("buffet.help.recipe")}</p>
              </div>
              <div className="col-span-4">
                <Input
                  label={t("buffet.perGuestQty")}
                  type="number"
                  step="0.01"
                  {...register(`items.${index}.perGuestQty`)}
                />
              </div>
              <div className="col-span-1">
                <Button
                  type="button"
                  variant="danger"
                  iconButton
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="neutral" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            {t("common:actions.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
