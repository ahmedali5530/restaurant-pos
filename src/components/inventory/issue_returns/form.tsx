import React, {useEffect, useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import * as yup from "yup";
import {Controller, useFieldArray, useForm, useWatch} from "react-hook-form";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input, InputError} from "@/components/common/input/input.tsx";
import {InputField} from "@/components/common/form/rhf-fields.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {AiSparklesIcon} from "@/components/common/icons/ai-sparkles.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {InventoryIssueReturn} from "@/api/model/inventory_issue_return.ts";
import {InventoryIssue} from "@/api/model/inventory_issue.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {User} from "@/api/model/user.ts";
import {RecordId, StringRecordId} from "surrealdb";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import _ from "lodash";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {fetchNextSequentialNumber, isUniqueRecordNumber} from "@/utils/recordNumbers.ts";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {DateValue} from "react-aria-components";
import {dateToCalendarDate, getToday} from "@/utils/date.ts";
import { documentCreatedAtFromDateValue, toJsDate } from "@/lib/datetime.ts";
import {InventoryFormPricedLineTotal} from "@/components/inventory/common/form.line.total.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { useIntegrationManager } from "@/providers/integration.provider.tsx";
import { publishIssueReturned } from "@/integrations/accounting/events/publish.ts";
import { postDocument } from "@/lib/inventory/posting.service.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";
import { ensureLocationForKitchen, toLocationRecordId } from "@/lib/inventory/location.service.ts";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {createIssueReturnImportConfig} from "@/components/inventory/issue_returns/issue-return.import.config.ts";

interface InventoryIssueReturnItemFormValue {
  item: { label: string; value: string } | null;
  issued_item?: { label: string; value: string } | null;
  location?: { label: string; value: string } | null;
  issued?: number | string;
  quantity: number | string;
  comments?: string;
}

interface InventoryIssueReturnFormValues {
  issuance?: { label: string; value: string } | null;
  issued_to?: { label: string; value: string } | null;
  location?: { label: string; value: string } | null;
  date?: DateValue | null;
  documents?: FileList;
  items: InventoryIssueReturnItemFormValue[];
}

const issueLabel = (issue: InventoryIssue) => {
  const destination = issue.location?.name ?? issue.kitchen?.name;
  const issuedTo = issue.issued_to
    ? ` - ${issue.issued_to.first_name} ${issue.issued_to.last_name}`
    : "";
  return `${issue.invoice_number}${destination ? ` - ${destination}` : ""}${issuedTo}`;
};

interface Props {
  open: boolean;
  onClose: () => void;
  data?: InventoryIssueReturn;
}

const createValidationSchema = (db: ReturnType<typeof useDB>, currentId?: string) => yup.object({
  invoice_number: yup.number().required().test(
    "unique-issue-return-invoice",
    "Invoice number already exists",
    async function (value) {
      if (value === undefined || value === null) {
        return true;
      }

      const isUnique = await isUniqueRecordNumber(
        db,
        Tables.inventory_issue_returns,
        "invoice_number",
        value,
        currentId
      );

      if (!isUnique) {
        return this.createError({
          message: "Invoice number already exists",
          path: "invoice_number"
        });
      }

      return true;
    }
  ),
  issuance: yup.object({
    label: yup.string(),
    value: yup.string()
  }).nullable().optional(),
  issued_to: yup.object({
    label: yup.string(),
    value: yup.string()
  }).nullable().optional(),
  location: yup.object({
    label: yup.string(),
    value: yup.string()
  }).nullable().optional(),
  date: yup.mixed().nullable().optional(),
  documents: yup.mixed().optional(),
  items: yup.array().of(
    yup.object({
      item: yup.object({
        label: yup.string(),
        value: yup.string()
      }).required("This is required").nullable(),
      issued_item: yup.object({
        label: yup.string(),
        value: yup.string()
      }).nullable().optional(),
      location: yup.object({
        label: yup.string(),
        value: yup.string()
      }).nullable().optional(),
      issued: yup.number().typeError("This should be a number").nullable().optional(),
      quantity: yup.number().typeError("This should be a number").required("This is required"),
      comments: yup.string().nullable().optional(),
    })
  ).min(1, "Add at least one item"),
}).required();

export const InventoryIssueReturnForm = ({open, onClose, data}: Props) => {
  const { t } = useTranslation(['inventory', 'common']);
  const db = useDB();
  const validationSchema = useMemo(() => createValidationSchema(db, data?.id), [data?.id]);
  const resolver = useMemo(() => yupResolver(validationSchema), [validationSchema]);

  const {
    data: issues,
    fetchData: fetchIssues,
    isFetching: loadingIssues
  } = useApi<SettingsData<InventoryIssue>>(Tables.inventory_issues, [], [], 0, 9999, ["issued_to", "location", "kitchen", "items", "items.item", "items.location"], {
    enabled: false
  });

  const {
    data: items,
    fetchData: fetchItems,
    isFetching: loadingItems
  } = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], [], 0, 9999, [], {
    enabled: false
  });

  const {
    data: users,
    fetchData: fetchUsers,
    isFetching: loadingUsers
  } = useApi<SettingsData<User>>(Tables.users, ['deleted_at = none'], [], 0, 9999, [], {
    enabled: false
  });

  const {
    control,
    register,
    watch,
    handleSubmit,
    formState: {errors},
    reset,
    setValue,
  } = useForm({
    resolver,
    defaultValues: {
      invoice_number: 0,
      issuance: null,
      issued_to: null,
      location: null,
      documents: undefined,
      items: [{
        item: null,
        issued_item: null,
        location: null,
        issued: undefined,
        quantity: 1,
        comments: ""
      }]
    }
  });

  const {fields, append, remove, replace} = useFieldArray({
    control,
    name: "items"
  });

  const [importModal, setImportModal] = useState(false);
  const issueReturnImportConfig = useMemo(
    () => createIssueReturnImportConfig({db, t, append}),
    [db, t, append]
  );

  useEffect(() => {
    if (open) {
      fetchIssues();
      fetchItems();
      fetchUsers();
    }
  }, [open, fetchIssues, fetchItems, fetchUsers]);

  useEffect(() => {
    let cancelled = false;

    const applyReset = async () => {
      if (data) {
        let destinationLocation: {label: string; value: string} | null = null;
        if (data.location) {
          destinationLocation = {
            label: data.location.name,
            value: recordIdToString(data.location.id),
          };
        } else if (data.kitchen?.id) {
          try {
            const locationId = await ensureLocationForKitchen(
              db,
              recordIdToString(data.kitchen.id)
            );
            if (!cancelled) {
              destinationLocation = {
                label: data.kitchen.name,
                value: locationId,
              };
            }
          } catch (error) {
            console.error("Failed to resolve location for kitchen", error);
          }
        } else if (data.issuance?.location) {
          destinationLocation = {
            label: data.issuance.location.name,
            value: recordIdToString(data.issuance.location.id),
          };
        }

        if (cancelled) return;

        reset({
          invoice_number: data.invoice_number,
          issuance: data.issuance ? {
            label: issueLabel(data.issuance),
            value: data.issuance.id
          } : null,
          issued_to: data.issued_to ? {
            label: data.issued_to.first_name + ' ' + data.issued_to.last_name,
            value: data.issued_to.id
          } : null,
          location: destinationLocation,
          date: data.created_at ? dateToCalendarDate(toJsDate(data.created_at)) : getToday(),
          documents: undefined,
          items: data.items?.map(item => {
            const loc = item.location || (item.issued_item as any)?.location;
            return {
              item: item.item ? {
                label: item.item.name,
                value: item.item.id
              } : null,
              issued_item: item.issued_item ? {
                label: item.issued_item.item?.name ? `${item.issued_item.item.name} (${item.issued_item.quantity})` : item.issued_item.id,
                value: item.issued_item.id
              } : null,
              location: loc ? {
                label: loc?.name,
                value: loc?.id
              } : null,
              issued: item.issued ?? undefined,
              quantity: item.quantity ?? 1,
              comments: item.comments ?? "",
            };
          })
        });
      } else if (open) {
        reset({
          invoice_number: 0,
          issuance: null,
          issued_to: null,
          location: null,
          date: getToday(),
          documents: undefined,
          items: [{
            item: null,
            issued_item: null,
            location: null,
            issued: undefined,
            quantity: 1,
            comments: "",
          }]
        });
      }
    };

    void applyReset();
    return () => {
      cancelled = true;
    };
  }, [data?.id, open, reset]);

  useEffect(() => {
    if (!open || data?.id) {
      return;
    }

    let isMounted = true;

    fetchNextSequentialNumber(db, Tables.inventory_issue_returns, "invoice_number")
      .then((nextNumber) => {
        if (isMounted) {
          setValue("invoice_number", nextNumber);
        }
      })
      .catch((error) => {
        console.error("Failed to fetch next issue return number", error);
        toast.error(t('toast:inventory.unableGenerateIssueReturnNumber'));
      });

    return () => {
      isMounted = false;
    };
  }, [open, data?.id, setValue, t]);

  const issuanceSelection = useWatch({control, name: "issuance"});
  const watchedItems = useWatch({control, name: "items"});
  const selectedIssuance = useMemo(() => {
    if (!issuanceSelection?.value) return undefined;
    return issues?.data?.find(issue => issue.id === issuanceSelection.value);
  }, [issuanceSelection, issues?.data]);
  const pricedLines = useMemo(
    () =>
      (watchedItems ?? []).map((line) => {
        const issued =
          selectedIssuance?.items?.find((issueItem) => issueItem.id === line.issued_item?.value) ||
          data?.items?.find((ri) => ri.issued_item?.id === line.issued_item?.value)?.issued_item;
        return {
          quantity: line.quantity,
          price: issued?.price ?? 0,
        };
      }),
    [watchedItems, selectedIssuance, data?.items],
  );

  // Load items and populate fields when issuance is selected
  useEffect(() => {
    if (data?.id) {
      return;
    }

    if (!selectedIssuance) {
      return;
    }

    if (selectedIssuance.issued_to) {
      setValue("issued_to", {
        label: `${selectedIssuance.issued_to.first_name} ${selectedIssuance.issued_to.last_name}`,
        value: selectedIssuance.issued_to.id
      });
    }

    const populateLocation = async () => {
      if (selectedIssuance.location) {
        setValue("location", {
          label: selectedIssuance.location.name,
          value: recordIdToString(selectedIssuance.location.id),
        });
        return;
      }
      if (selectedIssuance.kitchen?.id) {
        try {
          const locationId = await ensureLocationForKitchen(
            db,
            recordIdToString(selectedIssuance.kitchen.id)
          );
          setValue("location", {
            label: selectedIssuance.kitchen.name,
            value: locationId,
          });
        } catch (error) {
          console.error("Failed to resolve location for kitchen", error);
          setValue("location", null);
        }
      } else {
        setValue("location", null);
      }
    };
    void populateLocation();

    if (selectedIssuance.items && selectedIssuance.items.length > 0) {
      const newItems = selectedIssuance.items.map((issueItem) => {
        const loc = issueItem.location;
        return {
          item: issueItem.item ? {
            label: `${issueItem.item.name}-${issueItem.item.code}`,
            value: issueItem.item.id
          } : null,
          issued_item: {
            label: issueItem.item?.name ? `${issueItem.item.name} (${issueItem.quantity})` : issueItem.id,
            value: issueItem.id
          },
          location: loc ? {
            label: loc.name,
            value: loc.id
          } : null,
          issued: issueItem.quantity ?? undefined,
          quantity: issueItem.quantity ?? 1,
          comments: "",
        };
      });
      replace(newItems);
    } else {
      replace([{
        item: null,
        issued_item: null,
        location: null,
        issued: undefined,
        quantity: 1,
        comments: "",
      }]);
    }
  }, [selectedIssuance?.id, data?.id, setValue, replace]);

  const closeModal = () => {
    onClose();
    reset({
      invoice_number: 0,
      issuance: null,
      issued_to: null,
      location: null,
      date: getToday(),
      documents: undefined,
      items: [{
        item: null,
        issued_item: null,
        location: null,
        issued: undefined,
        quantity: 1,
        comments: "",
      }]
    });
  };

  const [state, ] = useAtom(appPage);
  const { manager: integrationManager } = useIntegrationManager();

  const convertFilesToDocuments = async (files: FileList | null | undefined): Promise<RecordId[]> => {
    if (!files || files.length === 0) return [];

    const documentRefs: RecordId[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const content = await file.arrayBuffer();

      const [created] = await db.create(Tables.documents, {
        name: file.name,
        content,
        size: file.size,
        mimeType: file.type || undefined,
      });

      if (created?.id) {
        documentRefs.push(created.id as RecordId);
      }
    }

    return documentRefs;
  };

  const onSubmit = async (values: any) => {
    try {
      const toRecordId = (value?: string | { toString(): string }) => {
        if (!value) return undefined;
        const stringValue = typeof value === "string" ? value : value.toString();
        return new StringRecordId(stringValue);
      };

      const documentRefs = await convertFilesToDocuments(values.documents);

      const payload = {
        invoice_number: Number(values.invoice_number),
        issuance: values.issuance ? toRecordId(values.issuance.value) : undefined,
        issued_to: values.issued_to ? toRecordId(values.issued_to.value) : undefined,
        location: values.location?.value
          ? toLocationRecordId(recordIdToString(values.location.value))
          : undefined,
        items: [],
        documents: documentRefs.length > 0 ? documentRefs : undefined,
        created_at: documentCreatedAtFromDateValue(values.date ?? null),
        created_by: toRecordId(state.user.id),
        status: data?.id
          ? (data.status && data.status !== "posted" ? data.status : "draft")
          : "draft",
      };

      let issueReturnId: any = data?.id;

      if (issueReturnId) {
        await db.merge(issueReturnId, payload);
        if (data?.items?.length) {
          await Promise.all(
            data.items
              .filter((item) => item.id)
              .map((item) => db.delete(item.id!))
          );
        }
      } else {
        const [created] = await db.create(Tables.inventory_issue_returns, payload);
        issueReturnId = created?.id;
      }

      const issueReturnIdString = issueReturnId
        ? typeof issueReturnId === "string"
          ? issueReturnId
          : issueReturnId
        : undefined;

      if (!issueReturnIdString) {
        throw new Error("Failed to resolve issue return identifier");
      }

      const itemRefs: StringRecordId[] = [];
      await Promise.all(
        values.items.map(async (item) => {
          const issuedIssueItem = selectedIssuance?.items?.find((issueItem) => {
            const issuedId = item.issued_item?.value;
            if (!issuedId || !issueItem.id) return false;
            return String(issueItem.id) === String(issuedId);
          });
          const locationValue = item.location?.value
            ?? (issuedIssueItem as any)?.location?.id
            ?? (issuedIssueItem as any)?.location;

          const [created] = await db.create(Tables.inventory_issue_return_items, {
            issue_return: toRecordId(issueReturnIdString),
            item: item.item ? toRecordId(item.item.value) : undefined,
            issued_item: item.issued_item ? toRecordId(item.issued_item.value) : undefined,
            location: locationValue
              ? toLocationRecordId(recordIdToString(locationValue) || String(locationValue))
              : undefined,
            issued: item.issued !== undefined && item.issued !== "" ? Number(item.issued) : undefined,
            quantity: Number(item.quantity),
            price: issuedIssueItem?.price != null
              ? Number(issuedIssueItem.price)
              : (item.price != null && item.price !== "" ? Number(item.price) : undefined),
            comments: item.comments?.trim() ? item.comments.trim() : undefined,
          });

          if (created?.id) {
            itemRefs.push(toRecordId(created.id));
          }
        })
      );

      await db.merge(issueReturnIdString, {
        items: itemRefs,
      });

      const userId = state?.user?.id ? recordIdToString(state.user.id) : undefined;
      await postDocument({
        db,
        documentType: "issue_return",
        documentId: String(issueReturnIdString),
        userId,
        integrationManager,
      });

      const inventoryValue = Number(
        values.items
          .reduce((sum, item) => {
            const qty = Number(item.quantity || 0);
            const issuedIssueItem = selectedIssuance?.items?.find((issueItem) => {
              const issuedId = item.issued_item?.value;
              if (!issuedId || !issueItem.id) return false;
              return String(issueItem.id) === String(issuedId);
            });
            const price = Number(
              issuedIssueItem?.price ??
                (item.price != null && item.price !== "" ? item.price : 0)
            );
            return sum + qty * price;
          }, 0)
          .toFixed(2)
      );
      if (inventoryValue > 0) {
        await publishIssueReturned(integrationManager, {
          documentId: String(issueReturnIdString),
          issuanceId: values.issuance?.value ? String(values.issuance.value) : undefined,
          inventoryValue,
        });
      }

      toast.success(t('toast:inventory.issueReturnSaved'));
      closeModal();
    } catch (error) {
      console.log(error)
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const issueOptions = issues?.data?.map(issue => ({
    label: issueLabel(issue),
    value: issue.id
  })) ?? [];

  const issuedItemOptions = selectedIssuance?.items?.map(item => ({
    label: item.item?.name ? `${item.item.name} (${item.quantity})` : item.id,
    value: item.id
  })) ?? [];

  const itemOptions = items?.data?.map(item => ({
    label: item.name,
    value: item.id
  })) ?? [];

  const userOptions = users?.data?.map(user => ({
    label: `${user.first_name} ${user.last_name}`,
    value: user.id
  })) ?? [];

  return (
    <>
    <Modal
      title={data ? `Update return ${data?.id}` : "Create new issue return"}
      open={open}
      onClose={closeModal}
      size="xl"
    >
      <form onSubmit={handleSubmit(onSubmit)}>

        <div className="flex flex-col gap-3 mb-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label>{t('columns.returnNumber')}</label>
              <Controller
                name="invoice_number"
                control={control}
                render={({field}) => (
                  <Input
                    value={field.value}
                    onChange={field.onChange}
                    type="number"
                    disabled={data?.id !== undefined}
                  />
                )}
              />
              <InputError error={_.get(errors, ["issuance", "message"])}/>
            </div>
            <div className="flex-1">
              <label>{t('columns.issuance')}</label>
              <Controller
                name="issuance"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={(option) => {
                      field.onChange(option);
                      if (!option) {
                        setValue("issued_to", null);
                        setValue("location", null);
                        replace([{
                          item: null,
                          issued_item: null,
                          location: null,
                          issued: undefined,
                          quantity: 1,
                          comments: "",
                        }]);
                      }
                    }}
                    options={issueOptions}
                    isLoading={loadingIssues}
                    isClearable
                  />
                )}
              />
              <InputError error={_.get(errors, ["issuance", "message"])}/>
            </div>
            <div className="flex-1">
              <label>{t('columns.issuedTo')}</label>
              <Controller
                name="issued_to"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={userOptions}
                    isLoading={loadingUsers}
                    isClearable
                    isDisabled
                  />
                )}
              />
              <InputError error={_.get(errors, ["issued_to", "message"])}/>
            </div>
            <div className="flex-1">
              <label>{t('columns.location')}</label>
              <Controller
                name="location"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={field.value ? [field.value] : []}
                    isClearable
                    isDisabled
                  />
                )}
              />
              <InputError error={_.get(errors, ["location", "message"])}/>
            </div>
            <div className="flex-1">
              <Controller
                name="date"
                control={control}
                render={({field}) => (
                  <DatePicker
                    label={t('forms.date')}
                    value={field.value as any}
                    onChange={field.onChange}
                    maxValue={getToday()}
                    isClearable={false}
                  />
                )}
              />
              <InputError error={_.get(errors, ["date", "message"])}/>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label>Documents</label>
              <input
                type="file"
                multiple
                {...register("documents")}
                className="w-full px-3 py-2 border border-neutral-400 rounded-lg"
              />
              <InputError error={_.get(errors, ["documents", "message"])}/>
            </div>
          </div>

          <fieldset className="border-2 border-neutral-900 rounded-lg p-3">
            <legend>{t('tabs.items')}</legend>
            <div className="mb-3 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setImportModal(true)}
              >
                <span className="mr-2"><AiSparklesIcon /></span>
                {t('common:actions.smartImport', {defaultValue: 'AI Import'})}
              </Button>
            </div>
            {fields.map((field, index) => (
              <div className="flex flex-col gap-3 mb-3" key={field.id}>
                {/* Hidden input for issued_item value */}
                <Controller
                  name={`items.${index}.issued_item`}
                  control={control}
                  render={({field}) => (
                    <input
                      type="hidden"
                      value={field.value?.value || ""}
                    />
                  )}
                />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label>{t('buttons.item')}</label>
                    <Controller
                      name={`items.${index}.item`}
                      control={control}
                      render={({field}) => (
                        <ReactSelect
                          value={field.value}
                          onChange={field.onChange}
                          options={itemOptions}
                          isLoading={loadingItems}
                          isDisabled
                        />
                      )}
                    />
                    <InputError error={_.get(errors, ["items", index, "item", "message"])}/>
                  </div>
                  <div className="flex-1">
                    <Controller
                      name={`items.${index}.issued`}
                      control={control}
                      render={({field}) => (
                        <Input
                          label={t('forms.issued')}
                          type="number"
                          value={field.value as number | string | undefined}
                          onChange={field.onChange}
                          error={_.get(errors, ["items", index, "issued", "message"])}
                          disabled
                        />
                      )}
                    />
                  </div>
                  <div className="flex-1">
                    <Controller
                      name={`items.${index}.quantity`}
                      control={control}
                      render={({field}) => (
                        <Input
                          label={t('forms.returnedQuantity')}
                          type="number"
                          value={field.value as number | string}
                          onChange={field.onChange}
                          error={_.get(errors, ["items", index, "quantity", "message"])}
                        />
                      )}
                    />
                  </div>
                  <div className="flex-1">
                    <InputField
                      name={`items.${index}.comments`}
                      control={control}
                      label={t('forms.comments')}
                    />
                  </div>
                  <div className="flex-0 self-end">
                    <IconTooltipButton label={t('common:actions.remove')}
                      type="button"
                      variant="danger"
                     
                      onClick={() => remove(index)}
                    >
                      <FontAwesomeIcon icon={faTrash}/>
                    </IconTooltipButton>
                  </div>
                </div>
              </div>
            ))}
            <InventoryFormPricedLineTotal lines={pricedLines} />
          </fieldset>
        </div>

        <div>
          <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
        </div>
      </form>
    </Modal>
    {importModal && (
      <DataImportModal
        isOpen
        onClose={() => setImportModal(false)}
        config={issueReturnImportConfig}
        title={t('forms.smartImportIssueReturnTitle', {defaultValue: 'AI Import return lines'})}
        onDone={() => setImportModal(false)}
      />
    )}
    </>
  );
};

