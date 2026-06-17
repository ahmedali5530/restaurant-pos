import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { toast } from 'sonner';
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { PaymentType, PaymentTypeGatewayConfig } from "@/api/model/payment_type.ts";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tax } from "@/api/model/tax.ts";
import { StringRecordId } from "surrealdb";
import {Discount} from "@/api/model/discount.ts";
import {toRecordId} from "@/lib/utils.ts";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import {GATEWAY_CATALOG, getGatewayDescriptor} from "@/lib/payment/gateway-catalog.ts";

interface Props {
  open: boolean
  onClose: () => void;
  data?: PaymentType
}

const validationSchema = z.object({
  name: z.string().min(1, i18n.t('validation:required')),
  priority: z.string().min(1, i18n.t('validation:required')),
  type: z.object({
    label: z.string(),
    value: z.string()
  }).required(),
  gateway: z.object({
    label: z.string(),
    value: z.string()
  }).nullable().optional(),
  gateway_mode: z.object({
    label: z.string(),
    value: z.string()
  }).nullable().optional(),
  gateway_config: z.object({
    public_key: z.string().optional().nullable(),
    secret_key: z.string().optional().nullable(),
    webhook_secret: z.string().optional().nullable(),
    client_id: z.string().optional().nullable(),
    client_secret: z.string().optional().nullable(),
    merchant_id: z.string().optional().nullable(),
    integrity_salt: z.string().optional().nullable(),
  }).optional(),
  tax: z.object({
    label: z.string(),
    value: z.string()
  }).optional().nullable(),
  discounts: z.array(z.object({
    label: z.string(),
    value: z.string()
  })).optional().nullable()
});

const EMPTY_GATEWAY_CONFIG = {
  public_key: "",
  secret_key: "",
  webhook_secret: "",
  client_id: "",
  client_secret: "",
  merchant_id: "",
  integrity_salt: "",
};

function getGatewayConfigId(config: PaymentType["gateway_config"]): string | null {
  if (!config) return null;
  if (typeof config === "string") return config;
  if (typeof config === "object" && "id" in config && config.id) {
    return String(config.id);
  }
  return null;
}

function getGatewayConfigValues(config: PaymentType["gateway_config"]) {
  if (!config || typeof config === "string") {
    return { ...EMPTY_GATEWAY_CONFIG };
  }

  const cfg = config as PaymentTypeGatewayConfig;
  return {
    public_key: cfg.public_key || "",
    secret_key: cfg.secret_key || "",
    webhook_secret: cfg.webhook_secret || "",
    client_id: cfg.client_id || "",
    client_secret: cfg.client_secret || "",
    merchant_id: cfg.merchant_id || "",
    integrity_salt: cfg.integrity_salt || "",
  };
}

export const PaymentTypeForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const closeModal = () => {
    onClose();
    reset({
      name: null,
      type: null,
      gateway: null,
      gateway_mode: null,
      gateway_config: { ...EMPTY_GATEWAY_CONFIG },
      priority: null,
      tax: null,
      discounts: []
    });
  }

  useEffect(() => {
    if(data){
      reset({
        ...data,
        name: data.name,
        priority: String(data.priority),
        type: {
          label: data.type,
          value: data.type
        },
        gateway: (data.gateway ? {
          label: data.gateway,
          value: data.gateway
        } : null),
        gateway_mode: (data.gateway_mode ? {
          label: data.gateway_mode,
          value: data.gateway_mode
        } : null),
        gateway_config: getGatewayConfigValues(data.gateway_config),
        tax: (data.tax ? {
          label: `${data?.tax?.name} ${data?.tax?.rate}%`,
          value: data?.tax?.id?.toString()
        } : undefined),
        discounts: data?.discounts?.map(item => ({
          label: item.name,
          value: item.id.toString()
        })),
      });
    }
  }, [data]);

  const db = useDB();

  const {
    data: taxes,
    fetch: fetchTaxes
  } = useApi<SettingsData<Tax>>(Tables.taxes, [], ['priority asc'], 0, 99999, [], {
    enabled: false
  });

  const {
    data: discounts,
    fetch: fetchDiscounts
  } = useApi<SettingsData<Discount>>(Tables.discounts, ['max_rate = min_rate'], ['priority asc'], 0, 99999, [], {
    enabled: false
  });

  const { register, control, handleSubmit, formState: {errors}, reset, watch } = useForm({
    resolver: zodResolver(validationSchema)
  });

  const types = [
    'Cash', 'Card', 'Points', 'Remote'
  ];
  const gatewayModes = ['sandbox', 'live'];
  const selectedType = watch('type');
  const selectedGateway = watch('gateway');
  const isRemoteType = selectedType?.value === 'Remote';
  const selectedGatewayDescriptor = getGatewayDescriptor(selectedGateway?.value);

  const onSubmit = async (values: any) => {
    const vals = {...values};

    vals.priority = Number(vals.priority);
    vals.type = values.type.value;
    if (values.type.value === 'Remote') {
      const cleanedGatewayConfig = Object.fromEntries(
        Object.entries(values.gateway_config || {}).filter(([, value]) => {
          return value !== undefined && value !== null && String(value).trim() !== '';
        })
      );
      vals.gateway = values.gateway?.value || null;
      vals.gateway_mode = values.gateway_mode?.value || null;

      const existingGatewayConfigId = getGatewayConfigId(data?.gateway_config);
      let gatewayConfigId = existingGatewayConfigId;

      if (values.gateway && Object.keys(cleanedGatewayConfig).length > 0) {
        if (gatewayConfigId) {
          await db.merge(gatewayConfigId, cleanedGatewayConfig);
        } else {
          const [createdGatewayConfig] = await db.create(Tables.payment_type_gateway_configs, cleanedGatewayConfig);
          gatewayConfigId = createdGatewayConfig?.id?.toString?.() || null;
        }
      } else {
        gatewayConfigId = null;
      }

      vals.gateway_config = gatewayConfigId ? new StringRecordId(gatewayConfigId) : null;
    } else {
      vals.gateway = null;
      vals.gateway_mode = null;
      vals.gateway_config = null;
    }

    if(values.tax){
      vals.tax = new StringRecordId(values.tax.value);
    }

    if(values.discounts){
      vals.discounts = values.discounts.map(item => new StringRecordId(item.value));
    }

    try {
      if(data?.id){
        await db.update(toRecordId(data.id), {
          ...vals
        })
      }else{
        await db.create(Tables.payment_types, {
          ...vals
        });
      }

      closeModal();
      toast.success(t('toast:admin.paymentTypeSaved', { name: values.name }));
    }catch(e){
      toast.error(e);
      console.log(e)
    }
  }

  useEffect(() => {
    if(open){
      fetchTaxes();
      fetchDiscounts();
    }
  }, [open]);

  console.log(errors);

  return (
    <>
      <Modal
        title={data ? t('forms.updatePaymentType', { name: data?.name }) : t('forms.createPaymentType')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <Input label={t('columns.name')} {...register('name')} autoFocus error={errors?.name?.message}/>
            </div>
            <div className="flex-1">
              <Controller
                render={({ field }) => (
                  <Input
                    type="number"
                    label={t('columns.priority')}
                    error={errors?.priority?.message}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
                name="priority"
                control={control}
              />
            </div>
          </div>

          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label htmlFor="">Type</label>
              <Controller
                render={({ field }) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={types.map(item => ({
                      label: item,
                      value: item
                    }))}
                  />
                )}
                name="type"
                control={control}
              />
            </div>
          </div>

          {isRemoteType && (
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label htmlFor="">Gateway Provider</label>
                <Controller
                  render={({ field }) => (
                    <ReactSelect
                      value={field.value}
                      onChange={field.onChange}
                      options={GATEWAY_CATALOG.map(item => ({
                        label: item.label,
                        value: item.id
                      }))}
                      isClearable
                      placeholder={t('forms.selectProvider')}
                    />
                  )}
                  name="gateway"
                  control={control}
                />
              </div>
              <div className="flex-1">
                <label htmlFor="">Gateway Mode</label>
                <Controller
                  render={({ field }) => (
                    <ReactSelect
                      value={field.value}
                      onChange={field.onChange}
                      options={gatewayModes.map(item => ({
                        label: item,
                        value: item
                      }))}
                      isClearable
                      isDisabled={!selectedGateway}
                      placeholder={t('forms.sandboxLive')}
                    />
                  )}
                  name="gateway_mode"
                  control={control}
                />
              </div>
            </div>
          )}

          {isRemoteType && selectedGatewayDescriptor && (
            <div className="mb-3 border rounded p-3">
              <h4 className="font-medium mb-3">Gateway Keys</h4>
              <div className="grid grid-cols-2 gap-3 mb-3">
                {selectedGatewayDescriptor.fields.map((field) => (
                  <Input
                    key={field.configKey}
                    label={field.label}
                    type={field.type === "password" ? "password" : "text"}
                    placeholder={field.placeholder}
                    {...register(`gateway_config.${field.configKey}`)}
                  />
                ))}
              </div>
              {selectedGatewayDescriptor.helpText && (
                <span className="text-sm text-neutral-500">
                  {selectedGatewayDescriptor.helpText}
                </span>
              )}
            </div>
          )}

          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label htmlFor="">Tax</label>
              <Controller
                render={({ field }) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={taxes?.data?.map(item => ({
                      label: `${item.name} ${item.rate}%`,
                      value: item.id.toString()
                    }))}
                    isClearable
                  />
                )}
                name="tax"
                control={control}
              />
            </div>
          </div>

          <div className="flex-1 mb-3">
            <label htmlFor="">Discounts</label>
            <Controller
              render={({ field }) => (
                <ReactSelect
                  value={field.value}
                  onChange={field.onChange}
                  options={discounts?.data?.map(item => ({
                    label: item.name,
                    value: item.id.toString()
                  }))}
                  isMulti
                />
              )}
              name="discounts"
              control={control}
            />
            <span className="text-sm text-neutral-500">Only fixed amount discounts can be applied</span>
          </div>

          <div>
            <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
