import React, {useEffect, useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
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
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {InventoryWaste} from "@/api/model/inventory_waste.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryPurchase} from "@/api/model/inventory_purchase.ts";
import {InventoryIssue} from "@/api/model/inventory_issue.ts";
import {RecordId, StringRecordId} from "surrealdb";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faTrash, faPlus} from "@fortawesome/free-solid-svg-icons";
import _ from "lodash";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {fetchNextSequentialNumber, isUniqueRecordNumber} from "@/utils/recordNumbers.ts";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {DateValue} from "react-aria-components";
import {dateToCalendarDate, calendarDateToDate, getToday} from "@/utils/date.ts";
import { nowSurrealDateTime, toJsDate, toSurrealDateTime } from "@/lib/datetime.ts";

type SourceType = "purchase" | "issue";

interface Props {
  open: boolean;
  onClose: () => void;
  data?: InventoryWaste;
}

const createValidationSchema = (db: ReturnType<typeof useDB>, currentId?: string) => yup.object({
  invoice_number: yup.number().typeError("This should be a number").required("This is required").test(
    "unique-waste-invoice",
    "Invoice number already exists",
    async function (value) {
      if (value === undefined || value === null) {
        return true;
      }

      const isUnique = await isUniqueRecordNumber(
        db,
        Tables.inventory_wastes,
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
  date: yup.mixed().nullable().optional(),
  documents: yup.mixed().optional(),
  items: yup.array().of(
    yup.object({
      source_type: yup.string().oneOf(["purchase", "issue"]).required("Select source type"),
      source_id: yup.string().required("Select a source"),
      item: yup.object({
        label: yup.string(),
        value: yup.string()
      }).required("This is required").nullable(),
      quantity: yup.number().typeError("This should be a number").required("This is required"),
      comments: yup.string().nullable().optional(),
      purchase_item_id: yup.string().nullable().optional(),
      issue_item_id: yup.string().nullable().optional(),
    })
  ).min(1, "Add at least one item"),
}).required();

export const InventoryWasteForm = ({open, onClose, data}: Props) => {
  const { t } = useTranslation('inventory');
  const db = useDB();
  const [state, ] = useAtom(appPage);
  const validationSchema = useMemo(() => createValidationSchema(db, data?.id), [db, data?.id]);
  const resolver = useMemo(() => yupResolver(validationSchema), [validationSchema]);

  const {
    data: items,
    fetchData: fetchItems,
    isFetching: loadingItems,
  } = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], [], 0, 9999, [], {
    enabled: false
  });

  const {
    data: purchases,
    fetchData: fetchPurchases,
    isFetching: loadingPurchases,
  } = useApi<SettingsData<InventoryPurchase>>(Tables.inventory_purchases, [], [], 0, 9999, ["items", "items.item"], {
    enabled: false
  });

  const {
    data: issues,
    fetchData: fetchIssues,
    isFetching: loadingIssues,
  } = useApi<SettingsData<InventoryIssue>>(Tables.inventory_issues, [], [], 0, 9999, ["items", "items.item"], {
    enabled: false
  });

  const {
    control,
    register,
    handleSubmit,
    formState: {errors},
    reset,
    watch,
    setValue,
  } = useForm({
    resolver,
  });

  const {fields, append, remove, replace} = useFieldArray({
    control,
    name: "items"
  });

  useEffect(() => {
    if (open) {
      fetchItems();
      fetchPurchases();
      fetchIssues();
    }
  }, [open, fetchItems, fetchPurchases, fetchIssues]);

  useEffect(() => {
    if (data) {
      reset({
        invoice_number: data.invoice_number,
        date: data.created_at ? dateToCalendarDate(toJsDate(data.created_at)) : getToday(),
        documents: undefined,
        items: data.items?.map(item => ({
          source_type: data.purchase ? "purchase" : data.issue ? "issue" : "purchase",
          source_id: data.purchase?.id ?? data.issue?.id ?? "",
          item: item.item ? {
            label: item.item.name,
            value: item.item.id
          } : null,
          purchase_item_id: item.purchase_item?.id,
          issue_item_id: item.issue_item?.id,
          quantity: item.quantity ?? 1,
          comments: item.comments ?? "",
        }))
      });
    }
  }, [data, open, reset]);

  useEffect(() => {
    if (!open || data?.id) {
      return;
    }

    let isMounted = true;

    fetchNextSequentialNumber(db, Tables.inventory_wastes, "invoice_number")
      .then((nextNumber) => {
        if (isMounted) {
          setValue("invoice_number", nextNumber);
        }
      })
      .catch((error) => {
        console.error("Failed to fetch next waste number", error);
        toast.error(t('toast:inventory.unableGenerateWasteNumber'));
      });

    return () => {
      isMounted = false;
    };
  }, [open, data?.id, db, setValue]);

  const closeModal = () => {
    onClose();
    reset({
      invoice_number: 1,
      date: getToday(),
      documents: undefined,
      items: []
    });
  };

  const toRecordId = (value?: string | { toString(): string }) => {
    if (!value) return undefined;
    const stringValue = typeof value === "string" ? value : value.toString();
    return new StringRecordId(stringValue);
  };

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
      const purchaseId = values.items?.find((item: any) => item.source_type === "purchase")?.source_id;
      const issueId = values.items?.find((item: any) => item.source_type === "issue")?.source_id;
      const documentRefs = await convertFilesToDocuments(values.documents);

      const payload = {
        invoice_number: Number(values.invoice_number),
        purchase: purchaseId ? toRecordId(purchaseId) : undefined,
        issue: issueId ? toRecordId(issueId) : undefined,
        documents: documentRefs.length > 0 ? documentRefs : undefined,
        items: [],
        created_at: values.date ? toSurrealDateTime(calendarDateToDate(values.date) || undefined) : nowSurrealDateTime(),
        created_by: toRecordId(state.user.id),
      };

      let wasteId: any = data?.id;

      if (wasteId) {
        await db.merge(wasteId, payload);
        if (data?.items?.length) {
          await Promise.all(
            data.items
              .filter((item) => item.id)
              .map((item) => db.delete(item.id!))
          );
        }
      } else {
        const [created] = await db.create(Tables.inventory_wastes, payload);
        wasteId = created?.id;
      }

      const wasteIdString = wasteId
        ? typeof wasteId === "string"
          ? wasteId
          : wasteId
        : undefined;

      if (!wasteIdString) {
        throw new Error("Failed to resolve waste identifier");
      }

      const itemsRefs = [];
      await Promise.all(
        values.items.map(async (item: any) => {
          const [created] = await db.create(Tables.inventory_waste_items, {
            item: item.item ? toRecordId(item.item.value) : undefined,
            purchase_item: item.purchase_item_id ? toRecordId(item.purchase_item_id) : undefined,
            issue_item: item.issue_item_id ? toRecordId(item.issue_item_id) : undefined,
            quantity: Number(item.quantity),
            comments: item.comments?.trim() ? item.comments.trim() : undefined,
            waste: toRecordId(wasteId)
          });

          if (created?.id) {
            itemsRefs.push((created.id));
          }
        })
      );

      await db.merge(toRecordId(wasteIdString), {
        items: itemsRefs,
      });

      toast.success(t('toast:inventory.wasteSaved'));
      closeModal();
    } catch (error) {
      console.log(error)
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const itemOptions = items?.data?.map(item => ({
    label: item.name,
    value: item.id
  })) ?? [];

  const purchaseOptions = purchases?.data?.map(purchase => ({
    label: `Invoice #${purchase.invoice_number}`,
    value: purchase.id
  })) ?? [];

  const issueOptions = issues?.data?.map(issue => ({
    label: `Issue #${issue.id}`,
    value: issue.id
  })) ?? [];

  const sourceTypeOptions = [
    { label: t('sourceType.purchase'), value: "purchase" },
    { label: t('sourceType.issue'), value: "issue" }
  ];

  return (
    <Modal
      title={data ? `Update waste #${data?.invoice_number}` : "Create new waste"}
      open={open}
      onClose={closeModal}
      size="xl"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <Controller
                name="invoice_number"
                control={control}
                render={({field}) => (
                  <Input
                    label={t('forms.invoiceNumber')}
                    type="number"
                    {...field}
                    value={field.value ?? ""}
                    error={errors?.invoice_number?.message}
                  />
                )}
              />
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
            <div className="mb-3">
              <Button
                type="button"
                icon={faPlus}
                variant="primary"
                onClick={() => append({
                  source_type: "purchase",
                  source_id: "",
                  item: null,
                  quantity: 1,
                  comments: "",
                  purchase_item_id: undefined,
                  issue_item_id: undefined,
                })}
              >
                Add item
              </Button>
            </div>

            {fields.map((field, index) => {
              const sourceType = watch(`items.${index}.source_type`) as SourceType;
              const sourceId = watch(`items.${index}.source_id`) as string | undefined;
              
              const selectedPurchase = purchases?.data?.find(p => p.id.toString() === sourceId?.toString());
              const selectedIssue = issues?.data?.find(i => i.id.toString() === sourceId?.toString());
              
              const availableItems = sourceType === "purchase" 
                ? selectedPurchase?.items ?? []
                : selectedIssue?.items ?? [];

              return (
                <div className="flex flex-col mb-3" key={field.id}>
                  <input type="hidden" {...register(`items.${index}.purchase_item_id` as const)} />
                  <input type="hidden" {...register(`items.${index}.issue_item_id` as const)} />
                  
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label>Source type</label>
                      <Controller
                        name={`items.${index}.source_type`}
                        control={control}
                        render={({field}) => (
                          <ReactSelect
                            value={sourceTypeOptions.find(opt => opt.value === field.value) ?? sourceTypeOptions[0]}
                            onChange={(option) => {
                              field.onChange(option?.value ?? "purchase");
                              setValue(`items.${index}.source_id`, "");
                              setValue(`items.${index}.item`, null);
                              setValue(`items.${index}.purchase_item_id`, undefined);
                              setValue(`items.${index}.issue_item_id`, undefined);
                            }}
                            options={sourceTypeOptions}
                            isClearable={false}
                          />
                        )}
                      />
                      <InputError error={_.get(errors, ["items", index, "source_type", "message"])}/>
                    </div>
                    <div className="flex-1">
                      <label>{sourceType === "purchase" ? "Purchase" : "Issue"}</label>
                      <Controller
                        name={`items.${index}.source_id`}
                        control={control}
                        render={({field}) => (
                          <ReactSelect
                            value={sourceType === "purchase"
                              ? purchaseOptions.find(opt => opt.value === field.value)
                              : issueOptions.find(opt => opt.value === field.value)}
                            onChange={(option) => {
                              field.onChange(option?.value ?? "");
                              setValue(`items.${index}.item`, null);
                              setValue(`items.${index}.purchase_item_id`, undefined);
                              setValue(`items.${index}.issue_item_id`, undefined);
                            }}
                            options={sourceType === "purchase" ? purchaseOptions : issueOptions}
                            isLoading={sourceType === "purchase" ? loadingPurchases : loadingIssues}
                            isClearable
                          />
                        )}
                      />
                      <InputError error={_.get(errors, ["items", index, "source_id", "message"])}/>
                    </div>
                    <div className="flex-1">
                      <label>{t('buttons.item')}</label>
                      <Controller
                        name={`items.${index}.item`}
                        control={control}
                        render={({field}) => {
                          const itemOptionsFromSource = availableItems.map((sourceItem: any) => ({
                            label: sourceItem.item?.name ? `${sourceItem.item.name} (${sourceItem.quantity})` : sourceItem.id,
                            value: sourceItem.item?.id ?? sourceItem.id
                          }));

                          return (
                            <ReactSelect
                              value={field.value}
                              onChange={(option) => {
                                field.onChange(option);
                                const selectedSourceItem = availableItems.find((si: any) => 
                                  (si.item?.id ?? si.id) === option?.value
                                );
                                if (selectedSourceItem) {
                                  if (sourceType === "purchase") {
                                    setValue(`items.${index}.purchase_item_id`, selectedSourceItem.id?.toString());
                                  } else {
                                    setValue(`items.${index}.issue_item_id`, selectedSourceItem.id?.toString());
                                  }
                                }
                              }}
                              options={itemOptionsFromSource}
                              isLoading={loadingItems}
                              isDisabled={!sourceId || availableItems.length === 0}
                            />
                          );
                        }}
                      />
                      <InputError error={_.get(errors, ["items", index, "item", "message"])}/>
                    </div>
                    <div className="flex-1">
                      <Controller
                        name={`items.${index}.quantity`}
                        control={control}
                        render={({field}) => (
                          <Input
                            label={t('forms.quantity')}
                            type="number"
                            value={field.value as number | string}
                            onChange={field.onChange}
                            error={_.get(errors, ["items", index, "quantity", "message"])}
                          />
                        )}
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        label={t('forms.comments')}
                        {...register(`items.${index}.comments` as const)}
                      />
                    </div>
                    <div className="flex-0 self-end">
                      <Button
                        type="button"
                        variant="danger"
                        iconButton
                        onClick={() => remove(index)}
                      >
                        <FontAwesomeIcon icon={faTrash}/>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </fieldset>
        </div>

        <div>
          <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};

