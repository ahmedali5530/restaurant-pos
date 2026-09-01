export const TRANSLATE_RECEIPTS_KEY = 'translate_receipts';

export interface TranslateReceiptsSettings {
  enabled: boolean;
}

export const DEFAULT_TRANSLATE_RECEIPTS: TranslateReceiptsSettings = {
  enabled: false,
};
