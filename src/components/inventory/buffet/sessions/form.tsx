import {useMemo} from "react";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {Controller, useForm} from "react-hook-form";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {InputField} from "@/components/common/form/rhf-fields.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {BuffetMenu, BuffetSessionType} from "@/api/model/buffet_menu.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {createBuffetSession} from "@/lib/inventory/buffet.service.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {businessDateFromJsDate} from "@/lib/kitchen/business-date.ts";
import {useInventoryLocations} from "@/hooks/useInventoryLocations.ts";

type SelectOption = {label: string; value: string} | null;

interface BuffetSessionFormValues {
  menu: SelectOption;
  location: SelectOption;
  businessDate: string;
  sessionType: SelectOption;
  expectedGuests: number | string;
  buffetPrice: number | string;
  notes?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (sessionId: string) => void;
}

const selectOptionSchema = yup.object({
  label: yup.string(),
  value: yup.string(),
});

const validationSchema = yup.object({
  menu: selectOptionSchema.required().nullable(),
  location: selectOptionSchema.required().nullable(),
  businessDate: yup.string().required(),
  sessionType: selectOptionSchema.required().nullable(),
  expectedGuests: yup.number().typeError("Number required").min(1).required(),
  buffetPrice: yup.number().typeError("Number required").min(0).required(),
  notes: yup.string().nullable().optional(),
});

export const BuffetSessionForm = ({open, onClose, onCreated}: Props) => {
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

  const {data: menus} = useApi<SettingsData<BuffetMenu>>(
    Tables.buffet_menus,
    ["is_active = true"],
    ["name asc"],
    0,
    9999
  );

  const {options: locationOptions} = useInventoryLocations(open);

  const menuOptions = useMemo(
    () =>
      menus?.data?.map((menu) => ({
        label: menu.name,
        value: recordToString(menu.id)!,
      })) ?? [],
    [menus]
  );

  const {
    control,
    handleSubmit,
    formState: {errors, isSubmitting},
  } = useForm<BuffetSessionFormValues>({
    resolver: yupResolver(validationSchema) as any,
    defaultValues: {
      businessDate: businessDateFromJsDate(new Date()),
      sessionType: sessionTypeOptions[1],
      expectedGuests: 50,
      buffetPrice: 0,
      notes: "",
    },
  });

  const onSubmit = async (values: BuffetSessionFormValues) => {
    const userId = recordToString(state?.user?.id);
    if (!userId) {
      toast.error(t("buffet.userRequired"));
      return;
    }

    try {
      const session = await createBuffetSession(
        db,
        {
          menuId: values.menu!.value,
          locationId: values.location!.value,
          businessDate: values.businessDate,
          sessionType: (values.sessionType?.value ?? "lunch") as BuffetSessionType,
          expectedGuests: Number(values.expectedGuests),
          buffetPrice: Number(values.buffetPrice),
          notes: values.notes,
        },
        userId
      );
      toast.success(t("buffet.sessionCreated"));
      onCreated?.(recordToString(session.id)!);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("buffet.sessionCreateFailed"));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("buffet.createSession")} size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div>
          <label>{t("buffet.menu")}</label>
          <Controller
            control={control}
            name="menu"
            render={({field}) => (
              <ReactSelect
                options={menuOptions}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <p className="text-sm text-neutral-600 mt-1">{t("buffet.help.menu")}</p>
        </div>

        <div>
          <label>{t("columns.location")}</label>
          <Controller
            control={control}
            name="location"
            render={({field}) => (
              <ReactSelect
                options={locationOptions}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <p className="text-sm text-neutral-600 mt-1">{t("buffet.help.location")}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <InputField
              name="businessDate"
              control={control}
              label={t("buffet.businessDate")}
              type="date"
              error={errors.businessDate?.message}
            />
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
            <p className="text-sm text-neutral-600 mt-1">{t("buffet.help.sessionType")}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <InputField
              name="expectedGuests"
              control={control}
              label={t("buffet.expectedGuests")}
              type="number"
              error={errors.expectedGuests?.message}
            />
          </div>
          <div>
            <InputField
              name="buffetPrice"
              control={control}
              label={t("buffet.buffetPrice")}
              type="number"
              step="0.01"
              error={errors.buffetPrice?.message}
            />
          </div>
        </div>

        <InputField name="notes" control={control} label={t("buffet.notes")} />

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
