import {useStoreInventory} from "@/hooks/useStoreInventory.ts";
import {useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {Button} from "@/components/common/input/button.tsx";
import { toLuxonDateTime } from "@/lib/datetime";
import {getReorderLevelForStore, isBelowReorderLevel} from "@/utils/inventory.ts";
import {lineAmount, resolveCatalogUnitCost} from "@/lib/inventory/line.cost.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";

export const StoreInventoryCell = ({locationId, item}: {locationId: string, item?: InventoryItem}) => {
  const { t } = useTranslation('inventory');
  const {netQuantity, loading, records} = useStoreInventory(item?.id, locationId);
  const [modal, setModal] = useState(false);
  const [display, setDisplay] = useState<"unified"|"split">("unified");

  const unitCost = resolveCatalogUnitCost(item);
  const stockValue = lineAmount(unitCost, netQuantity);

  const resolveItemMeta = (rowItem?: {name?: string; code?: string; uom?: string}) => ({
    ...rowItem,
    name: rowItem?.name || item?.name,
    code: rowItem?.code || item?.code,
    uom: rowItem?.uom || item?.uom,
  });

  const unified = useMemo(() => {
    const list: Array<{
      id: string;
      type: string;
      operator: string;
      quantity: number;
      signedQuantity: number;
      created_at: Date;
      item: {name?: string; code?: string; uom?: string};
      counterparty?: string;
      reversal?: boolean;
    }> = [
      ...records.purchases.map((row: any) => ({
        id: String(row.id),
        type: "purchase",
        operator: (row.signedQuantity ?? 0) >= 0 ? "+" : "-",
        quantity: row.quantity,
        signedQuantity: row.signedQuantity ?? 0,
        reversal: !!row.reversal,
        created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        item: resolveItemMeta(row.item),
        counterparty: row.counterparty,
      })),
      ...records.returns.map((row: any) => ({
        id: String(row.id),
        type: "return",
        operator: (row.signedQuantity ?? 0) >= 0 ? "+" : "-",
        quantity: row.quantity,
        signedQuantity: row.signedQuantity ?? 0,
        reversal: !!row.reversal,
        created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        item: resolveItemMeta(row.item),
        counterparty: row.counterparty,
      })),
      ...records.issues.map((row: any) => ({
        id: String(row.id),
        type: "issue",
        operator: (row.signedQuantity ?? 0) >= 0 ? "+" : "-",
        quantity: row.quantity,
        signedQuantity: row.signedQuantity ?? 0,
        reversal: !!row.reversal,
        created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        item: resolveItemMeta(row.item),
        counterparty: row.counterparty,
      })),
      ...records.issueReturns.map((row: any) => ({
        id: String(row.id),
        type: "issue_return",
        operator: (row.signedQuantity ?? 0) >= 0 ? "+" : "-",
        quantity: row.quantity,
        signedQuantity: row.signedQuantity ?? 0,
        reversal: !!row.reversal,
        created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        item: resolveItemMeta(row.item),
        counterparty: row.counterparty,
      })),
      ...records.waste.map((row: any) => ({
        id: String(row.id),
        type: "waste",
        operator: (row.signedQuantity ?? 0) >= 0 ? "+" : "-",
        quantity: row.quantity,
        signedQuantity: row.signedQuantity ?? 0,
        reversal: !!row.reversal,
        created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        item: resolveItemMeta(row.item),
        counterparty: row.counterparty,
      })),
      ...records.transfersIn.map((row) => ({
        id: row.id,
        type: "transfer_in",
        operator: ((row as any).signedQuantity ?? 0) >= 0 ? "+" : "-",
        quantity: row.quantity,
        signedQuantity: (row as any).signedQuantity ?? 0,
        reversal: !!(row as any).reversal,
        created_at: row.created_at,
        item: resolveItemMeta(row.item),
        counterparty: row.counterparty,
      })),
      ...records.transfersOut.map((row) => ({
        id: row.id,
        type: "transfer_out",
        operator: ((row as any).signedQuantity ?? 0) >= 0 ? "+" : "-",
        quantity: row.quantity,
        signedQuantity: (row as any).signedQuantity ?? 0,
        reversal: !!(row as any).reversal,
        created_at: row.created_at,
        item: resolveItemMeta(row.item),
        counterparty: row.counterparty,
      })),
      ...records.productionOutputs.map((row) => ({
        id: row.id,
        type: "production_in",
        operator: ((row as any).signedQuantity ?? 0) >= 0 ? "+" : "-",
        quantity: row.quantity,
        signedQuantity: (row as any).signedQuantity ?? 0,
        reversal: !!(row as any).reversal,
        created_at: row.created_at,
        item: resolveItemMeta(row.item),
        counterparty: row.counterparty ?? row.batchNumber,
      })),
      ...records.productionInputs.map((row) => ({
        id: row.id,
        type: "production_out",
        operator: ((row as any).signedQuantity ?? 0) >= 0 ? "+" : "-",
        quantity: row.quantity,
        signedQuantity: (row as any).signedQuantity ?? 0,
        reversal: !!(row as any).reversal,
        created_at: row.created_at,
        item: resolveItemMeta(row.item),
        counterparty: row.counterparty ?? row.batchNumber,
      })),
      ...records.buffetConsumption.map((row) => ({
        id: row.id,
        type: row.type,
        operator: ((row as any).signedQuantity ?? 0) >= 0 ? "+" : "-",
        quantity: row.quantity,
        signedQuantity: (row as any).signedQuantity ?? 0,
        reversal: !!(row as any).reversal,
        created_at: row.created_at,
        item: resolveItemMeta(row.item),
        counterparty: row.counterparty ?? row.sessionNumber,
      })),
      ...(records.adjustments ?? []).map((row) => ({
        id: row.id,
        type: "adjustment",
        operator: Number(row.quantity) >= 0 ? "+" : "-",
        quantity: Math.abs(Number(row.quantity) || 0),
        signedQuantity: Number(row.quantity) || 0,
        reversal: !!(row as any).reversal,
        created_at: row.created_at,
        item: resolveItemMeta(row.item),
        counterparty: row.counterparty ?? (row as any).notes,
      })),
    ];

    list.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

    return list;
  }, [records, item]);

  const split = useMemo(() => ({
    Purchase: records.purchases,
    Return: records.returns,
    Issue: records.issues,
    "Issue return": records.issueReturns,
    Waste: records.waste,
    [t("stockTransfer.transferIn")]: records.transfersIn,
    [t("stockTransfer.transferOut")]: records.transfersOut,
    [t("production.productionIn")]: records.productionOutputs,
    [t("production.productionOut")]: records.productionInputs,
    [t("buffet.consumption")]: records.buffetConsumption,
    [t("tabs.adjustments")]: records.adjustments ?? [],
  }), [records, t]);

  if (loading) {
    return <span className="text-gray-400">...</span>;
  }

  const reorderLevel = item ? getReorderLevelForStore(item, locationId) : 0;
  const belowReorder = item ? isBelowReorderLevel(item, locationId, netQuantity) : false;

  let total = 0;

  return (
    <>
      <span
        onClick={() => setModal(true)}
        className={`underline cursor-pointer inline-flex flex-col leading-tight ${belowReorder ? 'text-danger-600 font-medium' : ''}`}>
        <span>
          {netQuantity > 0 ? formatNumber(netQuantity) : '-'} {item?.uom}
          {reorderLevel > 0 && (
            <span className="text-neutral-500 font-normal"> / {reorderLevel}</span>
          )}
        </span>
        {netQuantity > 0 && (
          <span className="text-xs text-neutral-500 font-normal no-underline">
            {withCurrency(stockValue)}
          </span>
        )}
      </span>

      {modal && (
        <Modal
          open={true}
          onClose={() => setModal(false)}
          title={`Inventory details of ${item?.name}-${item?.code}`}
          size="full"
        >
          <div className="input-group">
            <Button
              variant="primary"
              filled={display === 'unified'}
              onClick={() => setDisplay('unified')}
            >Unified</Button>
            <Button
              variant="primary"
              filled={display === 'split'}
              onClick={() => setDisplay('split')}
            >Split</Button>
          </div>

          <div className="text-center text-2xl p-5 bg-gray-200 my-5">
            Current Quantity: {formatNumber(netQuantity)}{item?.uom}
            <div className="text-base text-neutral-600 mt-1">
              {t('columns.stockValue')}: {withCurrency(stockValue)}
              <span className="text-neutral-500"> ({withCurrency(unitCost)} / {item?.uom || 'unit'})</span>
            </div>
          </div>

          {display === 'unified' && (
            <table className="table table-hover table-sm mt-3 bg-white">
              <thead>
              <tr>
                <th>{t('common:actions.type')}</th>
                <th>{t('forms.date')}</th>
                <th>{t('buttons.item')}</th>
                <th>{t('columns.reference')}</th>
                <th>{t('forms.quantity')}</th>
                <th>{t('common:actions.total')}</th>
              </tr>
              </thead>
              <tbody>
              {unified.map((unifiedItem) => {
                total += unifiedItem.signedQuantity;

                return (
                  <tr key={`${unifiedItem.type}-${unifiedItem.id}`} className={unifiedItem.reversal ? "opacity-60 line-through" : ""}>
                    <td className="capitalize">
                      {unifiedItem.type.replace(/_/g, " ")}
                      {unifiedItem.reversal ? ` (${t("status.voided")})` : ""}
                    </td>
                    <td>{unifiedItem.created_at ? toLuxonDateTime(unifiedItem.created_at).toFormat(import.meta.env.VITE_DATE_FORMAT) : ""}</td>
                    <td>
                      {unifiedItem.item?.name}-{unifiedItem.item?.code}
                    </td>
                    <td className="text-neutral-600">
                      {unifiedItem.counterparty || "—"}
                    </td>
                    <td>{unifiedItem.operator}{unifiedItem.quantity} {unifiedItem.item?.uom}</td>
                    <td>{total} {unifiedItem.item?.uom}</td>
                  </tr>
                );
              })}
              </tbody>
              <tfoot>
              <tr>
                <th className="text-left" colSpan={5}>{t('common:actions.total')}</th>
                <th className="text-left">{total}</th>
              </tr>
              </tfoot>
            </table>
          )}

          {display === 'split' && (
            <>
              <div className="overflow-x-auto">
                <div className="grid grid-cols-[repeat(11,_300px)] gap-3 mt-3">
                  {Object.entries(split).map(([type, rows]) => {
                    let sectionTotal = 0;
                    return (
                      <div key={type}>
                        <h4 className="text-xl">{type}</h4>
                        <table className="table table-hover table-sm bg-white">
                          <thead>
                          <tr>
                            <th>{t('forms.date')}</th>
                            <th>{t('forms.quantity')}</th>
                          </tr>
                          </thead>
                          <tbody>
                          {rows.map((splitItem: any) => {
                            const signedQty = (splitItem.signedQuantity ?? Number(splitItem.quantity)) || 0;
                            sectionTotal += signedQty;

                            const displayQty = Math.abs(Number(splitItem.quantity) || 0);
                            const displayOp = signedQty >= 0 ? "+" : "-";

                            return (
                              <tr key={splitItem.id} className={splitItem.reversal ? "opacity-60 line-through" : ""}>
                                <td>{splitItem.created_at ? toLuxonDateTime(splitItem.created_at).toFormat(import.meta.env.VITE_DATE_FORMAT) : splitItem.created_at}</td>
                                <td>{displayOp}{displayQty} {splitItem.item?.uom || item?.uom}</td>
                              </tr>
                            );
                          })}
                          </tbody>
                          <tfoot>
                          <tr>
                            <th className="text-left">{t('common:actions.total')}</th>
                            <th className="text-left">{sectionTotal}</th>
                          </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
};
