import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input, InputError } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { Checkbox } from "@/components/common/input/checkbox.tsx";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { toast } from 'sonner';
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { useEffect, useState } from "react";
import { Discount, DiscountTargets, DiscountType } from "@/api/model/discount.ts";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import { DiscountScheduleEditor } from "@/components/settings/discounts/schedule.editor.tsx";
import { DiscountConditionsEditor } from "@/components/settings/discounts/conditions.editor.tsx";
import { DiscountTargetsEditor } from "@/components/settings/discounts/targets.editor.tsx";
import { refreshDiscountCache } from "@/hooks/useDiscountCache.ts";
import {
  mergeTargetsFromRecord,
  sanitizeTargetsForSave,
  validateTargetsForScope,
} from "@/lib/discount-engine/target-ids.ts";
import {
  DISCOUNT_CATEGORIES,
  STACKING_MODES,
  TAX_TREATMENTS,
} from "@/lib/discount-engine/types.ts";
import { translatedSelectOptions } from "@/lib/discount-engine/i18n-options.ts";

interface Props {
  open: boolean
  onClose: () => void;
  data?: Discount
}

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  type: yup.object().shape({
    label: yup.string(),
    value: yup.string()
  }).default(undefined).required(i18n.t('validation:required')),
  min_rate: yup.number().required(i18n.t('validation:required')),
  max_rate: yup.number().required(i18n.t('validation:required')),
  max_cap: yup.number().nullable(),
  priority: yup.string().required(i18n.t('validation:required')),
});

const SCOPES = ['item', 'category', 'cart', 'customer', 'floor'] as const;
const APPLICATION_MODES = ['manual', 'automatic', 'both'] as const;

export const DiscountForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast', 'payment']);
  const [schedules, setSchedules] = useState(data?.schedules || []);
  const [conditions, setConditions] = useState(data?.conditions);
  const [targets, setTargets] = useState<DiscountTargets>({});

  const categoryOptions = translatedSelectOptions(DISCOUNT_CATEGORIES, t, 'discountEngine.categories');
  const scopeOptions = translatedSelectOptions([...SCOPES], t, 'discountEngine.scopes');
  const applicationModeOptions = translatedSelectOptions([...APPLICATION_MODES], t, 'discountEngine.applicationModes');
  const stackingModeOptions = translatedSelectOptions([...STACKING_MODES], t, 'discountEngine.stackingModes');
  const taxTreatmentOptions = translatedSelectOptions([...TAX_TREATMENTS], t, 'discountEngine.taxTreatments');

  const closeModal = () => {
    onClose();
    reset({
      name: null,
      min_rate: null,
      max_rate: null,
      max_cap: null,
      type: null,
      priority: null
    });
    setSchedules([]);
    setConditions(undefined);
    setTargets({});
  }

  useEffect(() => {
    if( data ) {
      reset({
        ...data,
        name: data.name,
        min_rate: data.min_rate ?? data.min_value,
        max_rate: data.max_rate ?? data.max_value,
        max_cap: data.max_cap,
        type: { label: data?.type, value: data?.type },
        priority: data.priority.toString(),
        category: data.category
          ? categoryOptions.find(o => o.value === data.category) ?? { label: data.category, value: data.category }
          : null,
        scope: data.scope
          ? scopeOptions.find(o => o.value === data.scope) ?? { label: data.scope, value: data.scope }
          : scopeOptions.find(o => o.value === 'cart'),
        application_mode: data.application_mode
          ? applicationModeOptions.find(o => o.value === data.application_mode) ?? { label: data.application_mode, value: data.application_mode }
          : applicationModeOptions.find(o => o.value === 'manual'),
        stacking_mode: data.stacking_mode
          ? stackingModeOptions.find(o => o.value === data.stacking_mode) ?? { label: data.stacking_mode, value: data.stacking_mode }
          : stackingModeOptions.find(o => o.value === 'allow'),
        tax_treatment: data.tax_treatment
          ? taxTreatmentOptions.find(o => o.value === data.tax_treatment) ?? { label: data.tax_treatment, value: data.tax_treatment }
          : taxTreatmentOptions.find(o => o.value === 'tax_before_discount'),
        stackable: data.stackable ?? true,
        exclusive: data.exclusive ?? false,
        requires_reason: data.requires_reason ?? false,
        requires_approval: data.requires_approval ?? false,
        is_active: data.is_active ?? true,
        min_order_amount: data.min_order_amount ?? '',
      });
      setSchedules(data.schedules || []);
      setConditions(data.conditions);
      setTargets(mergeTargetsFromRecord(data));
    }
  }, [data]);

  const db = useDB();

  const { register, control, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm<any>({
    resolver: yupResolver(validationSchema)
  });

  const isPercent = watch('type')?.value === DiscountType.Percent;

  const onSubmit = async (values: any) => {
    const scopeValue = typeof values.scope === 'object' ? values.scope?.value : values.scope;
    if (!validateTargetsForScope(scopeValue, targets)) {
      toast.error(t('discountEngine.validation.targetRequired'));
      return;
    }

    const vals: Record<string, unknown> = { ...values };
    vals.priority = parseInt(vals.priority as string);
    if(vals.type){
      vals.type = (vals.type as { value: string }).value;
    }
    const mapSelect = (field: string) => {
      if (vals[field] && typeof vals[field] === 'object') {
        vals[field] = (vals[field] as { value: string }).value;
      }
    };
    ['category', 'scope', 'application_mode', 'stacking_mode', 'tax_treatment'].forEach(mapSelect);

    vals.value_type = vals.type === DiscountType.Percent ? 'percent' : 'fixed_amount';
    vals.value = vals.min_rate;
    vals.min_value = vals.min_rate;
    vals.max_value = vals.max_rate;
    vals.schedules = schedules;
    vals.conditions = conditions || null;
    vals.targets = sanitizeTargetsForSave(targets);
    if (vals.min_order_amount === '' || vals.min_order_amount === null || vals.min_order_amount === undefined) {
      vals.min_order_amount = null;
    } else {
      vals.min_order_amount = Number(vals.min_order_amount);
    }
    vals.is_active = vals.is_active ?? true;
    vals.stackable = vals.stackable ?? true;
    vals.exclusive = vals.exclusive ?? false;
    vals.requires_reason = vals.requires_reason ?? false;
    vals.requires_approval = vals.requires_approval ?? false;
    vals.stackable_with_coupon = vals.stackable_with_coupon ?? true;

    try {
      if( data?.id ) {
        await db.update(data.id, vals);
      } else {
        await db.create(Tables.discounts, vals);
      }

      await refreshDiscountCache(db);
      closeModal();
      toast.success(t('toast:admin.discountSaved', { name: values.name }));
    } catch ( e ) {
      toast.error(t('discountEngine.errors.saveFailed'));
      console.log(e)
    }
  }

  return (
    <Modal
      title={data ? t('forms.updateDiscount', { name: data?.name }) : t('forms.createDiscount')}
      open={open}
      onClose={closeModal}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col max-h-[80vh]">
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 mb-4">
          <fieldset className="border-2 border-neutral-900 rounded-lg p-3">
            <legend className="px-2 font-semibold">{t('discountEngine.sections.basic')}</legend>
            <div className="flex flex-col gap-3 mt-2">
              <Input label={t('columns.name')} {...register('name')} autoFocus error={errors?.name?.message as string}/>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label>{t('discountEngine.fields.category')}</label>
                  <Controller
                    render={({ field }) => (
                      <ReactSelect value={field.value} onChange={field.onChange} options={categoryOptions} />
                    )}
                    name="category"
                    control={control}
                  />
                </div>
                <div>
                  <label>{t('discountEngine.fields.scope')}</label>
                  <Controller
                    render={({ field }) => (
                      <ReactSelect value={field.value} onChange={field.onChange} options={scopeOptions} />
                    )}
                    name="scope"
                    control={control}
                  />
                </div>
              </div>

              <div>
                <label>{t('discountEngine.fields.applicationMode')}</label>
                <Controller
                  render={({ field }) => (
                    <ReactSelect value={field.value} onChange={field.onChange} options={applicationModeOptions} />
                  )}
                  name="application_mode"
                  control={control}
                />
              </div>
            </div>
          </fieldset>

          {watch('scope')?.value && (
            <fieldset className="border-2 border-neutral-900 rounded-lg p-3">
              <legend className="px-2 font-semibold">{t('discountEngine.sections.targets')}</legend>
              <div className="mt-2">
                <DiscountTargetsEditor
                  open={open}
                  scope={watch('scope')?.value}
                  value={targets}
                  onChange={setTargets}
                />
              </div>
            </fieldset>
          )}

          <fieldset className="border-2 border-neutral-900 rounded-lg p-3">
            <legend className="px-2 font-semibold">{t('discountEngine.sections.value')}</legend>
            <div className="flex flex-col gap-3 mt-2">
              <div>
                <label className="block mb-2">{t('discountEngine.fields.type')}</label>
                <div className="input-group">
                  <Button
                    type="button"
                    size="lg"
                    variant="primary"
                    active={watch('type')?.value === DiscountType.Percent}
                    className="flex-1"
                    onClick={() => setValue('type', { label: t('payment:discountType.percent'), value: DiscountType.Percent })}
                  >
                    {t('payment:discountType.percent')}
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="primary"
                    active={watch('type')?.value === DiscountType.Fixed}
                    className="flex-1"
                    onClick={() => setValue('type', { label: t('payment:discountType.fixed'), value: DiscountType.Fixed })}
                  >
                    {t('payment:discountType.fixed')}
                  </Button>
                </div>
                <InputError error={errors?.type?.message as string}/>
              </div>

              {isPercent && (
                <Controller
                  render={({ field }) => (
                    <Input label={t('columns.maxDiscountCap')} value={field.value} onChange={field.onChange}
                      error={errors?.max_cap?.message as string} />
                  )}
                  name="max_cap"
                  control={control}
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                <Controller
                  render={({ field }) => (
                    <Input
                      label={isPercent ? t('discountEngine.fields.minPercent') : t('discountEngine.fields.minRate')}
                      value={field.value}
                      onChange={field.onChange}
                      error={errors?.min_rate?.message as string}
                    />
                  )}
                  name="min_rate"
                  control={control}
                />
                <Controller
                  render={({ field }) => (
                    <Input
                      label={isPercent ? t('discountEngine.fields.maxPercent') : t('discountEngine.fields.maxRate')}
                      value={field.value}
                      onChange={field.onChange}
                      error={errors?.max_rate?.message as string}
                    />
                  )}
                  name="max_rate"
                  control={control}
                />
              </div>

              <Controller
                render={({ field }) => (
                  <Input type="number" label={t('columns.priority')} error={errors?.priority?.message as string}
                    value={field.value} onChange={field.onChange} />
                )}
                name="priority"
                control={control}
              />

              <Controller
                render={({ field }) => (
                  <Input
                    type="number"
                    label={t('discountEngine.fields.minOrderAmount')}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
                name="min_order_amount"
                control={control}
              />
            </div>
          </fieldset>

          <fieldset className="border-2 border-neutral-900 rounded-lg p-3">
            <legend className="px-2 font-semibold">{t('discountEngine.sections.stacking')}</legend>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label>{t('discountEngine.fields.stackingMode')}</label>
                <Controller
                  render={({ field }) => (
                    <ReactSelect value={field.value} onChange={field.onChange} options={stackingModeOptions} />
                  )}
                  name="stacking_mode"
                  control={control}
                />
              </div>
              <div>
                <label>{t('discountEngine.fields.taxTreatment')}</label>
                <Controller
                  render={({ field }) => (
                    <ReactSelect value={field.value} onChange={field.onChange} options={taxTreatmentOptions} />
                  )}
                  name="tax_treatment"
                  control={control}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="border-2 border-neutral-900 rounded-lg p-3">
            <legend className="px-2 font-semibold">{t('discountEngine.sections.options')}</legend>
            <div className="flex flex-wrap gap-4 mt-2">
              <Controller
                name="stackable"
                control={control}
                defaultValue={true}
                render={({ field }) => (
                  <Checkbox
                    label={t('discountEngine.fields.stackable')}
                    checked={field.value ?? true}
                    onChange={e => field.onChange((e.target as HTMLInputElement).checked)}
                  />
                )}
              />
              <Controller
                name="exclusive"
                control={control}
                defaultValue={false}
                render={({ field }) => (
                  <Checkbox
                    label={t('discountEngine.fields.exclusive')}
                    checked={!!field.value}
                    onChange={e => field.onChange((e.target as HTMLInputElement).checked)}
                  />
                )}
              />
              <Controller
                name="requires_reason"
                control={control}
                defaultValue={false}
                render={({ field }) => (
                  <Checkbox
                    label={t('discountEngine.fields.requiresReason')}
                    checked={!!field.value}
                    onChange={e => field.onChange((e.target as HTMLInputElement).checked)}
                  />
                )}
              />
              <Controller
                name="requires_approval"
                control={control}
                defaultValue={false}
                render={({ field }) => (
                  <Checkbox
                    label={t('discountEngine.fields.requiresApproval')}
                    checked={!!field.value}
                    onChange={e => field.onChange((e.target as HTMLInputElement).checked)}
                  />
                )}
              />
              <Controller
                name="is_active"
                control={control}
                defaultValue={true}
                render={({ field }) => (
                  <Checkbox
                    label={t('discountEngine.fields.isActive')}
                    checked={field.value ?? true}
                    onChange={e => field.onChange((e.target as HTMLInputElement).checked)}
                  />
                )}
              />
            </div>
          </fieldset>

          <fieldset className="border-2 border-neutral-900 rounded-lg p-3">
            <legend className="px-2 font-semibold">{t('discountEngine.sections.schedule')}</legend>
            <div className="mt-2">
              <DiscountScheduleEditor value={schedules} onChange={setSchedules} />
            </div>
          </fieldset>

          {watch('category')?.value === 'buy_x_get_y' && (
            <fieldset className="border-2 border-neutral-900 rounded-lg p-3">
              <legend className="px-2 font-semibold">{t('discountEngine.sections.bxgy')}</legend>
              <div className="mt-2">
                <DiscountConditionsEditor open={open} value={conditions} onChange={setConditions} />
              </div>
            </fieldset>
          )}
        </div>

        <div className="border-t pt-3">
          <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
        </div>
      </form>
    </Modal>
  )
}
