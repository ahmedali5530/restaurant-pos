import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useDB } from '@/api/db/db.ts';
import { Tables } from '@/api/db/tables.ts';
import { Setting } from '@/api/model/setting.ts';
import { Input } from '@/components/common/input/input.tsx';
import { Switch } from '@/components/common/input/switch.tsx';
import { ReactSelect } from '@/components/common/input/custom.react.select.tsx';
import { toast } from 'sonner';
import { useSecurity } from '@/hooks/useSecurity.ts';
import { useTranslation } from 'react-i18next';
import { posStore } from '@/infrastructure/pos-store/pos-store.ts';
import {
  DEFAULT_NUMBER_POLICY,
  NUMBER_POLICY_KEY,
  formatInvoiceDisplay,
  normalizeNumberPolicy,
  policyFromPreset,
  policyRequiresGapAck,
  type NumberPolicy,
  type NumberPolicyMint,
  type NumberPolicyPreset,
  type NumberPolicyReset,
  type NumberPolicyScope,
} from '@/lib/number-policy.ts';

type Option<T extends string> = { label: string; value: T };

interface FormValues {
  preset: Option<NumberPolicyPreset> | null;
  mint: Option<NumberPolicyMint> | null;
  reset: Option<NumberPolicyReset> | null;
  scope: Option<NumberPolicyScope> | null;
  startAt: number;
  pad: number;
  template: string;
  prefix: string;
  suffix: string;
  branchCode: string;
  terminalCode: string;
  pendingMode: Option<'random' | 'blank'> | null;
  pendingMinChars: number;
  pendingMaxChars: number;
  acknowledgeGaps: boolean;
}

const PRESETS: NumberPolicyPreset[] = [
  'date_reset',
  'global',
  'period',
  'branch',
  'terminal',
  'prefix',
  'composite',
  'pool',
  'hybrid',
  'fiscal_plus_posr',
  'provider_defined',
];

function toForm(policy: NumberPolicy, terminalCode: string, t: (k: string) => string): FormValues {
  return {
    preset: { value: policy.preset, label: t(`numberPolicy.presets.${policy.preset}`) },
    mint: { value: policy.mint, label: t(`numberPolicy.mint.${policy.mint}`) },
    reset: { value: policy.reset, label: t(`numberPolicy.reset.${policy.reset}`) },
    scope: { value: policy.scope, label: t(`numberPolicy.scope.${policy.scope}`) },
    startAt: policy.startAt,
    pad: policy.pad,
    template: policy.template,
    prefix: policy.prefix,
    suffix: policy.suffix,
    branchCode: policy.branchCode,
    terminalCode,
    pendingMode: {
      value: policy.pending.mode,
      label: t(`numberPolicy.pendingMode.${policy.pending.mode}`),
    },
    pendingMinChars: policy.pending.minChars,
    pendingMaxChars: policy.pending.maxChars,
    acknowledgeGaps: Boolean(policy.acknowledgeGaps),
  };
}

function fromForm(values: FormValues): NumberPolicy {
  const preset = values.preset?.value ?? 'date_reset';
  const base = policyFromPreset(preset);
  return normalizeNumberPolicy({
    ...base,
    preset,
    mint: values.mint?.value ?? base.mint,
    reset: values.reset?.value ?? base.reset,
    scope: values.scope?.value ?? base.scope,
    startAt: Number(values.startAt) || 1,
    pad: Number(values.pad) || 0,
    template: values.template || '{seq}',
    prefix: values.prefix || '',
    suffix: values.suffix || '',
    branchCode: values.branchCode || '',
    pending: {
      mode: values.pendingMode?.value ?? 'random',
      minChars: Number(values.pendingMinChars) || 6,
      maxChars: Number(values.pendingMaxChars) || 6,
    },
    acknowledgeGaps: Boolean(values.acknowledgeGaps),
  });
}

export const NumberPolicySettingsCard = () => {
  const db = useDB();
  const [settings, setSettings] = useState<Setting>();
  const { protectFormSubmit } = useSecurity();
  const { t } = useTranslation(['settings', 'common']);

  const { control, handleSubmit, reset, watch } = useForm<FormValues>({
    defaultValues: toForm(DEFAULT_NUMBER_POLICY, '', t),
  });

  const watched = useWatch({ control });
  const presetValue = watch('preset')?.value;

  const presetOptions = useMemo(
    () => PRESETS.map((value) => ({ value, label: t(`numberPolicy.presets.${value}`) })),
    [t],
  );
  const mintOptions = useMemo(
    () => (['gateway', 'terminal', 'hybrid'] as NumberPolicyMint[]).map((value) => ({
      value,
      label: t(`numberPolicy.mint.${value}`),
    })),
    [t],
  );
  const resetOptions = useMemo(
    () => (['never', 'day', 'month', 'year'] as NumberPolicyReset[]).map((value) => ({
      value,
      label: t(`numberPolicy.reset.${value}`),
    })),
    [t],
  );
  const scopeOptions = useMemo(
    () => (['restaurant', 'branch', 'terminal'] as NumberPolicyScope[]).map((value) => ({
      value,
      label: t(`numberPolicy.scope.${value}`),
    })),
    [t],
  );
  const pendingModeOptions = useMemo(
    () => (['random', 'blank'] as const).map((value) => ({
      value,
      label: t(`numberPolicy.pendingMode.${value}`),
    })),
    [t],
  );

  const preview = useMemo(() => {
    try {
      const policy = fromForm(watched as FormValues);
      return formatInvoiceDisplay(policy, {
        seq: policy.startAt,
        day: new Date().toISOString().slice(0, 10),
        terminal: (watched as FormValues).terminalCode || 'T1',
        branch: policy.branchCode || 'LHR',
      });
    } catch {
      return '-';
    }
  }, [watched]);

  const needsGapAck = useMemo(() => {
    try {
      return policyRequiresGapAck(fromForm(watched as FormValues));
    } catch {
      return false;
    }
  }, [watched]);

  const loadSettings = async () => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true`,
      { key: NUMBER_POLICY_KEY },
    ) as [Setting[] | undefined];
    setSettings(rows?.[0]);
    const identity = await posStore.getTerminalIdentity();
    const policy = normalizeNumberPolicy(rows?.[0]?.values);
    reset(toForm(policy, identity.terminalCode || '', t));
  };

  const onPresetChange = (option: Option<NumberPolicyPreset> | null) => {
    if (!option) return;
    const next = policyFromPreset(option.value);
    const terminalCode = watch('terminalCode');
    reset(toForm(next, terminalCode, t));
  };

  const saveSettings = async (values: FormValues) => {
    const payload = fromForm(values);
    if (policyRequiresGapAck(payload) && !payload.acknowledgeGaps) {
      toast.error(t('settings:numberPolicy.ackRequired'));
      return;
    }

    if (settings?.id) {
      await db.merge(settings.id, { values: payload });
    } else {
      await db.create(Tables.settings, {
        key: NUMBER_POLICY_KEY,
        is_global: true,
        values: payload,
      });
    }

    if (values.terminalCode?.trim()) {
      await posStore.setTerminalCode(values.terminalCode);
    }

    toast.success(t('settings:numberPolicy.updated'));
    await loadSettings();
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  return (
    <div className="shadow p-5 rounded-xl bg-surface-elevated" data-testid="settings-card-number-policy">
      <h2 className="text-xl font-semibold mb-1">{t('settings:numberPolicy.title')}</h2>
      <p className="settings-card-desc mb-3">
        {t('settings:numberPolicy.description')}
      </p>
      <p
        className="text-sm text-muted mb-5 min-h-[4.5rem]"
        data-testid="number-policy-pros-cons"
      >
        {presetValue ? t(`settings:numberPolicy.help.${presetValue}`) : '\u00a0'}
      </p>
      <form
        onSubmit={protectFormSubmit(handleSubmit(saveSettings), {
          module: 'settings.number_policy',
          description: t('settings:numberPolicy.saveDescription'),
        })}
      >
        <div className="grid grid-cols-1 gap-4 mb-4">
          <div>
            <label className="block text-sm mb-1">{t('settings:numberPolicy.preset')}</label>
            <Controller
              name="preset"
              control={control}
              render={({ field }) => (
                <ReactSelect
                  options={presetOptions}
                  value={field.value}
                  onChange={(opt) => onPresetChange(opt as Option<NumberPolicyPreset> | null)}
                  isClearable={false}
                />
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">{t('settings:numberPolicy.mintLabel')}</label>
              <Controller
                name="mint"
                control={control}
                render={({ field }) => (
                  <ReactSelect
                    options={mintOptions}
                    value={field.value}
                    onChange={field.onChange}
                    isClearable={false}
                  />
                )}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">{t('settings:numberPolicy.resetLabel')}</label>
              <Controller
                name="reset"
                control={control}
                render={({ field }) => (
                  <ReactSelect
                    options={resetOptions}
                    value={field.value}
                    onChange={field.onChange}
                    isClearable={false}
                  />
                )}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">{t('settings:numberPolicy.scopeLabel')}</label>
              <Controller
                name="scope"
                control={control}
                render={({ field }) => (
                  <ReactSelect
                    options={scopeOptions}
                    value={field.value}
                    onChange={field.onChange}
                    isClearable={false}
                  />
                )}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">{t('settings:numberPolicy.pendingModeLabel')}</label>
              <Controller
                name="pendingMode"
                control={control}
                render={({ field }) => (
                  <ReactSelect
                    options={pendingModeOptions}
                    value={field.value}
                    onChange={field.onChange}
                    isClearable={false}
                  />
                )}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Controller
                name="template"
                control={control}
                render={({ field }) => (
                  <Input
                    label={t('settings:numberPolicy.template')}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            <div>
              <Controller
                name="prefix"
                control={control}
                render={({ field }) => (
                  <Input
                    label={t('settings:numberPolicy.prefix')}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            <div>
              <Controller
                name="suffix"
                control={control}
                render={({ field }) => (
                  <Input
                    label={t('settings:numberPolicy.suffix')}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            <div>
              <Controller
                name="branchCode"
                control={control}
                render={({ field }) => (
                  <Input
                    label={t('settings:numberPolicy.branchCode')}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            <div>
              <Controller
                name="terminalCode"
                control={control}
                render={({ field }) => (
                  <Input
                    label={t('settings:numberPolicy.terminalCode')}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            <div>
              <Controller
                name="startAt"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    label={t('settings:numberPolicy.startAt')}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            <div>
              <Controller
                name="pad"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    label={t('settings:numberPolicy.pad')}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            <div>
              <Controller
                name="pendingMinChars"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    label={t('settings:numberPolicy.pendingMin')}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            <div>
              <Controller
                name="pendingMaxChars"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    label={t('settings:numberPolicy.pendingMax')}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </div>
          <div className="rounded-lg bg-surface p-3 text-sm" data-testid="number-policy-preview">
            <span className="text-muted">{t('settings:numberPolicy.preview')}: </span>
            <span className="font-mono font-semibold">{preview}</span>
          </div>
          <div className="min-h-[5.5rem]">
            {needsGapAck ? (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
                <p className="text-sm mb-2">{t('settings:numberPolicy.gapWarning')}</p>
                <Controller
                  name="acknowledgeGaps"
                  control={control}
                  render={({ field }) => (
                    <div>
                      <Switch checked={!!field.value} onChange={field.onChange}>
                        {t('settings:numberPolicy.acknowledgeGaps')}
                      </Switch>
                    </div>
                  )}
                />
              </div>
            ) : null}
          </div>
        </div>
        <button className="btn btn-primary" type="submit">{t('common:actions.save')}</button>
      </form>
    </div>
  );
};
