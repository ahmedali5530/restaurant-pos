import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { InputField } from "@/components/common/form/rhf-fields.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { toast } from 'sonner';
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { useEffect, useState } from "react";
import { PaymentType, PaymentTypeGatewayConfig } from "@/api/model/payment_type.ts";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tax } from "@/api/model/tax.ts";
import {toRecordId} from "@/lib/utils.ts";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import {GATEWAY_CATALOG, getGatewayDescriptor} from "@/lib/payment/gateway-catalog.ts";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { TaxForm } from "@/components/settings/taxes/tax.form.tsx";
import { saveGatewayCredentials } from "@/lib/payment.service.ts";

import { emitEntityCrudSave } from '@/integrations/events/entity-write.ts';
interface Props {
  open: boolean
  onClose: () => void;
  data?: PaymentType
}

const selectOptionSchema = yup.object({
  label: yup.string(),
  value: yup.string()
});

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  priority: yup.string().required(i18n.t('validation:required')),
  type: selectOptionSchema.required(i18n.t('validation:required')),
  gateway: selectOptionSchema.nullable().optional(),
  gateway_mode: selectOptionSchema.nullable().optional(),
  gateway_config: yup.object({
    public_key: yup.string().optional().nullable(),
    secret_key: yup.string().optional().nullable(),
    webhook_secret: yup.string().optional().nullable(),
    client_id: yup.string().optional().nullable(),
    client_secret: yup.string().optional().nullable(),
    merchant_id: yup.string().optional().nullable(),
    integrity_salt: yup.string().optional().nullable(),
  }).optional(),
  tax: selectOptionSchema.optional().nullable(),
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

function resolveSelectRecordId(option: { value?: unknown } | null | undefined) {
  const raw = option?.value;
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  return toRecordId(raw);
}

function paymentTypeIdToString(id: unknown): string | null {
  if (id == null) return null;
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && typeof (id as { toString?: () => string }).toString === 'function') {
    const text = String(id);
    return text.includes(':') ? text : null;
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

/**
 * SECURITY: gateway credentials are stored encrypted at rest and are never sent
 * to the browser. When editing an existing Remote payment type, credential fields
 * stay empty on purpose — enter new values only to replace stored secrets.
 */
function shouldShowEncryptedCredentialsHint(
  data: PaymentType | undefined,
  isRemoteType: boolean,
  gatewayValue: string | undefined,
): boolean {
  if (!data?.id || !isRemoteType || !gatewayValue) {
    return false;
  }

  const encrypted = (data as { gateway_config_encrypted?: unknown }).gateway_config_encrypted;
  if (typeof encrypted === 'string' && encrypted.length > 0) {
    return true;
  }

  const legacy = data.gateway_config;
  if (legacy) {
    if (typeof legacy === 'string') {
      return true;
    }
    if (typeof legacy === 'object') {
      return Object.values(legacy).some((v) => v != null && String(v).trim() !== '');
    }
  }

  // Existing Remote type with a gateway — credentials live server-side (encrypted).
  return true;
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
    });
  }

  useEffect(() => {
    if(data){
      reset({
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
          value: data?.tax?.id != null ? String(data.tax.id) : undefined
        } : null),
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

  const { control, handleSubmit, formState: {errors}, reset, watch } = useForm({
    resolver: yupResolver(validationSchema)
  });

  const types = [
    'Cash', 'Card', 'Points', 'Remote'
  ];
  const gatewayModes = ['sandbox', 'live'];
  const selectedType = watch('type');
  const selectedGateway = watch('gateway');
  const isRemoteType = selectedType?.value === 'Remote';
  const selectedGatewayDescriptor = getGatewayDescriptor(selectedGateway?.value);
  const showEncryptedCredentialsHint = shouldShowEncryptedCredentialsHint(
    data,
    isRemoteType,
    selectedGateway?.value || data?.gateway,
  );

  const onSubmit = async (values: any) => {
    const isRemote = values.type?.value === 'Remote';

    // Extract non-empty gateway credential values. Declared here (outside the
    // Remote branch) so we can reference it later when deciding whether to
    // call the encrypted-save endpoint.
    const cleanedGatewayConfig: Record<string, string> = Object.fromEntries(
      Object.entries(values.gateway_config || {})
        .filter(([, value]) => {
          return value !== undefined && value !== null && String(value).trim() !== '';
        })
        .map(([key, value]) => [key, String(value)])
    );

    const payload: Record<string, unknown> = {
      name: values.name,
      priority: Number(values.priority),
      type: values.type.value,
      gateway: isRemote ? (values.gateway?.value || null) : null,
      gateway_mode: isRemote ? (values.gateway_mode?.value || null) : null,
      // Credentials are saved via the encrypted endpoint — never write plaintext here.
      gateway_config: null,
      tax: resolveSelectRecordId(values.tax),
      discounts: null,
      has_discount: false,
    };

    const credentialsToSave = (isRemote && values.gateway && Object.keys(cleanedGatewayConfig).length > 0)
      ? cleanedGatewayConfig
      : null;

    try {
      let savedPaymentTypeId: string | null = null;
      if(data?.id){
        await db.update(toRecordId(data.id), payload);
        savedPaymentTypeId = paymentTypeIdToString(data.id);
      }else{
        const [created] = await db.create(Tables.payment_types, payload);
        savedPaymentTypeId = paymentTypeIdToString(created?.id);
      }

      // Now save the gateway credentials via the encrypted endpoint (if any).
      // This happens AFTER the payment_type record exists — the server needs
      // the id to know which record to update.
      if (credentialsToSave && savedPaymentTypeId) {
        try {
          await saveGatewayCredentials(savedPaymentTypeId, credentialsToSave);
        } catch (err: any) {
          // The payment_type was saved, but the credentials failed to encrypt.
          // Surface the error — the operator should retry. The payment_type
          // itself is functional (e.g. for Cash/Card) but the remote gateway
          // won't work until credentials are saved.
          toast.error(t('toast:admin.gatewayCredentialsSaveFailed', {
            error: err?.message || String(err),
          }));
          // Don't close the modal — let the operator retry.
          return;
        }
      }


      await emitEntityCrudSave({
        domain: 'manage',
        table: Tables.payment_types,
        entityId: data?.id ? String(data.id) : Tables.payment_types,
        isUpdate: Boolean(data?.id),
        source: 'settings-form',
      });

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
    }
  }, [open]);

  const [taxModal, setTaxModal] = useState(false);

  return (
    <>
      <Modal
        testId="admin-form-payment-type"
        title={data ? t('forms.updatePaymentType', { name: data?.name }) : t('forms.createPaymentType')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <InputField name="name" control={control} label={t('columns.name')} autoFocus error={errors?.name?.message}/>
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
              {showEncryptedCredentialsHint && (
                <div className="mb-3 p-2 bg-warning-50 border border-warning-200 rounded text-sm text-warning-800 dark:bg-warning-950/30 dark:border-warning-800 dark:text-warning-200">
                  <strong>{t('admin:forms.encryptedCredentialsHint')}</strong>{' '}
                  {t('admin:forms.encryptedCredentialsExplanation')}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 mb-3">
                {selectedGatewayDescriptor.fields.map((field) => (
                  <InputField
                    key={field.configKey}
                    name={`gateway_config.${field.configKey}`}
                    control={control}
                    label={field.label}
                    type={field.type === "password" ? "password" : "text"}
                    placeholder={field.placeholder}
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

          <div className="flex gap-3 mb-3 items-end">
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
            <IconTooltipButton label={t('common:actions.add')} type="button" variant="primary" onClick={() => setTaxModal(true)}><FontAwesomeIcon icon={faPlus}/></IconTooltipButton>
          </div>

          <div>
            <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
          </div>
        </form>
      </Modal>

      {taxModal && (
        <TaxForm
          open={true}
          onClose={() => {
            fetchTaxes();
            setTaxModal(false);
          }}
        />
      )}
    </>
  )
}
