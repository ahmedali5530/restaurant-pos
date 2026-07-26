import i18n from '@/lib/i18n.ts';
import { ACCESS_RULE_MODULES } from '@/lib/access.rules.ts';

const getPermissionLabels = (): Record<string, string> => {
  const labels = i18n.t('admin:accessRules.permissions', { returnObjects: true });
  if (labels && typeof labels === 'object' && !Array.isArray(labels)) {
    return labels as Record<string, string>;
  }
  return {};
};

export const getAccessRuleModuleLabel = (moduleKey: string): string => {
  const fallback = ACCESS_RULE_MODULES[moduleKey]?.label ?? moduleKey;
  return i18n.t(`admin:accessRules.modules.${moduleKey}.label`, { defaultValue: fallback });
};

export const getAccessRuleChildLabel = (child: string): string => {
  const labels = getPermissionLabels();
  if (labels[child]) {
    return labels[child];
  }
  return child;
};
