import { JournalTemplate } from '@/integrations/accounting/types.ts';
import {
  RESTAURANT_SALE_TEMPLATE_ID,
  restaurantSaleTemplate,
} from '@/integrations/accounting/templates/restaurant-sale.ts';

export const RESTAURANT_SALE_REVERSAL_TEMPLATE_ID = 'restaurant_sale_reversal';
export const PAYROLL_POSTED_TEMPLATE_ID = 'payroll_posted';
export const PURCHASE_RECEIVED_TEMPLATE_ID = 'purchase_received';
export const PURCHASE_RETURNED_TEMPLATE_ID = 'purchase_returned';
export const WASTE_RECORDED_TEMPLATE_ID = 'waste_recorded';
export const INVENTORY_ADJUSTED_TEMPLATE_ID = 'inventory_adjusted';
export const INVENTORY_ISSUED_TEMPLATE_ID = 'inventory_issued';
export const ISSUE_RETURNED_TEMPLATE_ID = 'issue_returned';
export const INVENTORY_TRANSFERRED_TEMPLATE_ID = 'inventory_transferred';
export const PRODUCTION_COMPLETED_TEMPLATE_ID = 'production_completed';

/** Flip debit/credit of restaurant sale for refunds and paid cancels. */
export const restaurantSaleReversalTemplate: JournalTemplate = {
  id: RESTAURANT_SALE_REVERSAL_TEMPLATE_ID,
  name: 'Restaurant Sale Reversal',
  memo: 'POS sale reversal',
  lines: restaurantSaleTemplate.lines.map((line) => ({
    ...line,
    side: line.side === 'debit' ? 'credit' : 'debit',
  })),
};

export const payrollPostedTemplate: JournalTemplate = {
  id: PAYROLL_POSTED_TEMPLATE_ID,
  name: 'Payroll Posted',
  memo: 'Payroll liability',
  lines: [
    {
      logicalAccount: 'PAYROLL_EXPENSE',
      side: 'debit',
      amountKey: 'grossPay',
      description: 'Payroll expense',
    },
    {
      logicalAccount: 'PAYROLL_LIABILITY',
      side: 'credit',
      amountKey: 'grossPay',
      description: 'Payroll payable',
    },
  ],
};

export const purchaseReceivedTemplate: JournalTemplate = {
  id: PURCHASE_RECEIVED_TEMPLATE_ID,
  name: 'Purchase Received',
  memo: 'Inventory purchase',
  lines: [
    {
      logicalAccount: 'INVENTORY',
      side: 'debit',
      amountKey: 'inventoryValue',
      description: 'Inventory received',
    },
    {
      logicalAccount: 'ACCOUNTS_PAYABLE',
      side: 'credit',
      amountKey: 'inventoryValue',
      description: 'Accounts payable',
    },
  ],
};

export const purchaseReturnedTemplate: JournalTemplate = {
  id: PURCHASE_RETURNED_TEMPLATE_ID,
  name: 'Purchase Returned',
  memo: 'Inventory purchase return',
  lines: [
    {
      logicalAccount: 'ACCOUNTS_PAYABLE',
      side: 'debit',
      amountKey: 'inventoryValue',
      description: 'AP reduction',
    },
    {
      logicalAccount: 'INVENTORY',
      side: 'credit',
      amountKey: 'inventoryValue',
      description: 'Inventory returned',
    },
  ],
};

export const wasteRecordedTemplate: JournalTemplate = {
  id: WASTE_RECORDED_TEMPLATE_ID,
  name: 'Waste Recorded',
  memo: 'Inventory waste',
  lines: [
    {
      logicalAccount: 'WASTE_EXPENSE',
      side: 'debit',
      amountKey: 'inventoryValue',
      description: 'Waste expense',
    },
    {
      logicalAccount: 'INVENTORY',
      side: 'credit',
      amountKey: 'inventoryValue',
      description: 'Inventory written off',
    },
  ],
};

export const inventoryAdjustedTemplate: JournalTemplate = {
  id: INVENTORY_ADJUSTED_TEMPLATE_ID,
  name: 'Inventory Adjusted',
  memo: 'Inventory adjustment',
  lines: [
    {
      logicalAccount: 'INVENTORY',
      side: 'debit',
      amountKey: 'increaseValue',
      description: 'Inventory increase',
      omitWhenZero: true,
    },
    {
      logicalAccount: 'INVENTORY_ADJUSTMENT',
      side: 'credit',
      amountKey: 'increaseValue',
      description: 'Adjustment gain',
      omitWhenZero: true,
    },
    {
      logicalAccount: 'INVENTORY_ADJUSTMENT',
      side: 'debit',
      amountKey: 'decreaseValue',
      description: 'Adjustment loss',
      omitWhenZero: true,
    },
    {
      logicalAccount: 'INVENTORY',
      side: 'credit',
      amountKey: 'decreaseValue',
      description: 'Inventory decrease',
      omitWhenZero: true,
    },
  ],
};

export const inventoryIssuedTemplate: JournalTemplate = {
  id: INVENTORY_ISSUED_TEMPLATE_ID,
  name: 'Inventory Issued',
  memo: 'Kitchen issue / COGS',
  lines: [
    {
      logicalAccount: 'COGS',
      side: 'debit',
      amountKey: 'inventoryValue',
      description: 'Cost of goods sold',
    },
    {
      logicalAccount: 'INVENTORY',
      side: 'credit',
      amountKey: 'inventoryValue',
      description: 'Inventory issued',
    },
  ],
};

export const issueReturnedTemplate: JournalTemplate = {
  id: ISSUE_RETURNED_TEMPLATE_ID,
  name: 'Issue Returned',
  memo: 'Issue return to inventory',
  lines: [
    {
      logicalAccount: 'INVENTORY',
      side: 'debit',
      amountKey: 'inventoryValue',
      description: 'Inventory returned from issue',
    },
    {
      logicalAccount: 'COGS',
      side: 'credit',
      amountKey: 'inventoryValue',
      description: 'COGS reversal',
    },
  ],
};

/**
 * Transfer is balanced Inventory↔Inventory on the same GL account.
 * Memo carries from/to location; two lines keep the journal balanced for audit.
 */
export const inventoryTransferredTemplate: JournalTemplate = {
  id: INVENTORY_TRANSFERRED_TEMPLATE_ID,
  name: 'Inventory Transferred',
  memo: 'Stock transfer',
  lines: [
    {
      logicalAccount: 'INVENTORY',
      side: 'debit',
      amountKey: 'inventoryValue',
      description: 'Inventory in (destination)',
    },
    {
      logicalAccount: 'INVENTORY',
      side: 'credit',
      amountKey: 'inventoryValue',
      description: 'Inventory out (source)',
    },
  ],
};

export const productionCompletedTemplate: JournalTemplate = {
  id: PRODUCTION_COMPLETED_TEMPLATE_ID,
  name: 'Production Completed',
  memo: 'Production batch',
  lines: [
    {
      logicalAccount: 'INVENTORY',
      side: 'debit',
      amountKey: 'outputCost',
      description: 'Finished goods / outputs',
      omitWhenZero: true,
    },
    {
      logicalAccount: 'INVENTORY',
      side: 'credit',
      amountKey: 'inputCost',
      description: 'Raw materials consumed',
      omitWhenZero: true,
    },
    {
      logicalAccount: 'WASTE_EXPENSE',
      side: 'debit',
      amountKey: 'yieldLoss',
      description: 'Production yield loss',
      omitWhenZero: true,
    },
  ],
};

const TEMPLATES: Record<string, JournalTemplate> = {
  [RESTAURANT_SALE_TEMPLATE_ID]: restaurantSaleTemplate,
  [RESTAURANT_SALE_REVERSAL_TEMPLATE_ID]: restaurantSaleReversalTemplate,
  [PAYROLL_POSTED_TEMPLATE_ID]: payrollPostedTemplate,
  [PURCHASE_RECEIVED_TEMPLATE_ID]: purchaseReceivedTemplate,
  [PURCHASE_RETURNED_TEMPLATE_ID]: purchaseReturnedTemplate,
  [WASTE_RECORDED_TEMPLATE_ID]: wasteRecordedTemplate,
  [INVENTORY_ADJUSTED_TEMPLATE_ID]: inventoryAdjustedTemplate,
  [INVENTORY_ISSUED_TEMPLATE_ID]: inventoryIssuedTemplate,
  [ISSUE_RETURNED_TEMPLATE_ID]: issueReturnedTemplate,
  [INVENTORY_TRANSFERRED_TEMPLATE_ID]: inventoryTransferredTemplate,
  [PRODUCTION_COMPLETED_TEMPLATE_ID]: productionCompletedTemplate,
};

export const getJournalTemplate = (templateId: string): JournalTemplate | undefined =>
  TEMPLATES[templateId];

export const listJournalTemplates = (): JournalTemplate[] => Object.values(TEMPLATES);
