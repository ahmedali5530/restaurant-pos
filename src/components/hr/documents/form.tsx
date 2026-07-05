import {ChangeEvent, useEffect, useMemo} from "react";
import {useForm, Controller} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {DateValue} from "react-aria-components";
import {EmployeeDocument} from "@/api/model/employee_document.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Employee} from "@/api/model/employee.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrDateField, HrFormField, HrSelectField, HrStringSelectField} from "@/components/hr/shared/form-field.tsx";
import {
  SelectOption,
  calendarDateToSurreal,
  enumLocaleKey,
  enumOptions,
  firstFormError,
  toCalendarDateValue,
  toRecordId,
  toUserRecordId,
} from "@/components/hr/shared/form.utils.ts";
import {DocumentCategory} from "@/api/model/hr.types.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {nowSurrealDateTime} from "@/lib/datetime.ts";

const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "contract", "certificate", "license", "id_document", "medical", "warning", "other",
];

interface FormValues {
  id?: string;
  employee: SelectOption | null;
  category?: DocumentCategory;
  title: string;
  expires_at?: DateValue | null;
  file?: File | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: EmployeeDocument;
}

const validationSchema = yup.object({
  id: yup.string().optional(),
  employee: yup.object({label: yup.string().required(), value: yup.string().required()}).nullable().required("Required"),
  category: yup.string().optional(),
  title: yup.string().required("Required"),
  expires_at: yup.mixed().nullable().optional(),
  file: yup.mixed().nullable().optional(),
}).required();

export const DocumentForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const [page] = useAtom(appPage);
  const employeesHook = useApi<SettingsData<Employee>>(Tables.employees, [], [], 0, 500, []);

  const {register, handleSubmit, control, reset, formState: {errors}} = useForm<FormValues>({
    resolver: yupResolver(validationSchema) as never,
    defaultValues: {category: "other", file: null},
  });

  const employeeOptions = useMemo(
    () => (employeesHook.data?.data ?? []).map((item) => ({
      value: String(item.id),
      label: `${item.employee_number} — ${item.first_name} ${item.last_name ?? ""}`.trim(),
    })),
    [employeesHook.data?.data],
  );

  const categoryOptions = useMemo(
    () => enumOptions(t, DOCUMENT_CATEGORIES, "documentCategories", enumLocaleKey),
    [t],
  );

  const closeModal = () => {
    onClose();
    reset({employee: null, category: "other", title: "", expires_at: null, file: null, id: undefined});
  };

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        employee: data.employee ? {
          value: String(data.employee.id),
          label: `${data.employee.employee_number} — ${data.employee.first_name} ${data.employee.last_name ?? ""}`.trim(),
        } : null,
        category: data.category ?? "other",
        title: data.title ?? "",
        expires_at: toCalendarDateValue(data.expires_at),
        file: null,
      });
    } else if (open) {
      reset({employee: null, category: "other", title: "", expires_at: null, file: null, id: undefined});
    }
  }, [data, open, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (data?.id) {
        await db.update(data.id, {
          employee: toRecordId(values.employee?.value),
          category: values.category ?? "other",
          title: values.title.trim(),
          expires_at: calendarDateToSurreal(values.expires_at),
        });
      } else {
        if (!values.file) {
          toast.error(t("forms.document.attachFile"));
          return;
        }

        const content = await values.file.arrayBuffer();
        const created = await db.create(Tables.documents, {
          name: values.file.name,
          content,
          size: values.file.size,
          mimeType: values.file.type || undefined,
          type: "employee_document",
        });
        const docId = Array.isArray(created) ? created[0]?.id : (created as {id?: string})?.id;

        await db.create(Tables.employee_documents, {
          employee: toRecordId(values.employee?.value),
          document: toRecordId(docId ? String(docId) : undefined),
          category: values.category ?? "other",
          title: values.title.trim(),
          expires_at: calendarDateToSurreal(values.expires_at),
          uploaded_by: toUserRecordId(page.user),
          uploaded_at: nowSurrealDateTime(),
        });
      }

      toast.success(t("buttons.save"));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal title={data ? t("forms.document.update") : t("forms.document.create")} open={open} onClose={closeModal} size="lg">
      <form onSubmit={handleSubmit(onSubmit, (errs) => {
        const message = firstFormError(errs);
        if (message) toast.error(message);
      })}>
        {/*<input type="hidden" {...register("id")} />*/}
        <div className="flex flex-col gap-3 mb-3">
          <HrSelectField
            label={t("forms.document.employee")}
            name="employee"
            control={control}
            options={employeeOptions}
            isClearable={false}
            error={errors.employee?.message}
          />
          <div>
            <Input label={t("forms.document.title")} {...register("title")} error={errors.title?.message}/>
          </div>
          <HrStringSelectField
            label={t("forms.document.category")}
            name="category"
            control={control}
            options={categoryOptions}
            error={errors.category?.message}
          />
          <HrDateField
            label={t("forms.document.expiresAt")}
            name="expires_at"
            control={control}
            error={errors.expires_at?.message}
          />
          {!data && (
            <HrFormField label={t("forms.document.attachFile")} error={errors.file?.message as string | undefined}>
              <Controller
                control={control}
                name="file"
                render={({field}) => (
                  <input
                    type="file"
                    className="input w-full"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      field.onChange(e.target.files?.[0] ?? null);
                    }}
                  />
                )}
              />
            </HrFormField>
          )}
        </div>
        <Button type="submit" variant="primary">{t("buttons.save")}</Button>
      </form>
    </Modal>
  );
};
