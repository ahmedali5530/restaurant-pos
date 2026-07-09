import {registerPrintTemplate} from "@/lib/print.service.ts";
import React from "react";
import {PrintPresaleBill} from "@/components/prints/presale.bill.tsx";
import {PrintFinalBill} from "@/components/prints/final.bill.tsx";
import {PrintRefundBill} from "@/components/prints/refund.bill.tsx";
import {Summary} from "@/components/summary/summary.tsx";

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

}



