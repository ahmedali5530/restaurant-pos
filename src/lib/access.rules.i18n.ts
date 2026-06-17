import i18n from '@/lib/i18n.ts';
import { ACCESS_RULE_MODULES } from '@/lib/access.rules.ts';

export const getAccessRuleModuleLabel = (moduleKey: string): string => {
  const fallback = ACCESS_RULE_MODULES[moduleKey]?.label ?? moduleKey;
  return i18n.t(`admin:accessRules.modules.${moduleKey}.label`, { defaultValue: fallback });
};

export const getAccessRuleChildLabel = (child: string): string => {
  return i18n.t(`admin:accessRules.permissions.${child}`, { defaultValue: child });
};
