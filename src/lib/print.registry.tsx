export enum PRINT_TYPE {
  presale_bill = 'temp',
  final_bill = 'final',
  refund_bill = 'refund',
  kitchen_bill = 'kitchen',
  delivery_bill = 'delivery',
  summary = 'summary',
  pulse = 'pulse',
}

export function initializePrintTemplates() {
  // ESC/POS builders handle receipt templates; React on-screen bills were removed.
}
