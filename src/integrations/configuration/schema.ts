import { ProviderConfigurationSchema, ProviderManifestField } from '@/integrations/core/types.ts';

export const getSchemaFields = (schema: ProviderConfigurationSchema): ProviderManifestField[] => {
  if (schema.sections?.length) {
    return schema.sections.flatMap((section) => section.fields);
  }
  return schema.fields ?? [];
};

export const getSchemaDefaults = (schema: ProviderConfigurationSchema): Record<string, unknown> => {
  return getSchemaFields(schema).reduce<Record<string, unknown>>((acc, field) => {
    if (field.defaultValue !== undefined) {
      acc[field.key] = field.defaultValue;
    }
    return acc;
  }, {});
};
