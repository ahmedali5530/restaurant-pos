import { JournalTemplate } from '@/integrations/accounting/types.ts';

export const RESTAURANT_SALE_TEMPLATE_ID = 'restaurant_sale';

/**
 * Restaurant sale journal:
 * Debit cash / card / other receivables from tenders
 * Credit sales revenue + VAT
 * Optional: discount (debit), tips (credit)
 */
export const restaurantSaleTemplate: JournalTemplate = {
  id: RESTAURANT_SALE_TEMPLATE_ID,
  name: 'Restaurant Sale',
  memo: 'POS sale',
  lines: [
    {
      logicalAccount: 'CASH_MAIN',
      side: 'debit',
      amountKey: 'cashAmount',
      description: 'Cash tender',
      omitWhenZero: true,
    },
    {
      logicalAccount: 'CARD_RECEIVABLE',
      side: 'debit',
      amountKey: 'cardAmount',
      description: 'Card tender',
      omitWhenZero: true,
    },
    {
      logicalAccount: 'OTHER_RECEIVABLE',
      side: 'debit',
      amountKey: 'otherAmount',
      description: 'Other tender',
      omitWhenZero: true,
    },
    {
      logicalAccount: 'DISCOUNT',
      side: 'debit',
      amountKey: 'discountAmount',
      description: 'Sales discount',
      omitWhenZero: true,
    },
    {
      logicalAccount: 'SALES_REVENUE',
      side: 'credit',
      amountKey: 'salesRevenue',
      description: 'Sales revenue',
      omitWhenZero: true,
    },
    {
      logicalAccount: 'VAT_OUTPUT',
      side: 'credit',
      amountKey: 'taxAmount',
      description: 'VAT / tax payable',
      omitWhenZero: true,
    },
    {
      logicalAccount: 'TIPS',
      side: 'credit',
      amountKey: 'tipAmount',
      description: 'Tips',
      omitWhenZero: true,
    },
  ],
};

const TEMPLATES: Record<string, JournalTemplate> = {
  [RESTAURANT_SALE_TEMPLATE_ID]: restaurantSaleTemplate,
};

export const getJournalTemplate = (templateId: string): JournalTemplate | undefined =>
  TEMPLATES[templateId];

export const listJournalTemplates = (): JournalTemplate[] => Object.values(TEMPLATES);
