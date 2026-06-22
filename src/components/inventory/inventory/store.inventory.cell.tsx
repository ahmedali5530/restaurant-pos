import {useStoreInventory} from "@/hooks/useStoreInventory.ts";
import {useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {Button} from "@/components/common/input/button.tsx";
import { toLuxonDateTime } from "@/lib/datetime";

const isDebitType = (type: string) =>
  type === "issue" || type === "return" || type === "waste" || type === "transfer_out"
  || type === "production_out" || type.startsWith("buffet_");

export const StoreInventoryCell = ({storeId, item}: {storeId: string, item?: InventoryItem}) => {
  const { t } = useTranslation('inventory');
  const {netQuantity, loading, records} = useStoreInventory(item?.id, storeId);
  const [modal, setModal] = useState(false);
  const [display, setDisplay] = useState<"unified"|"split">("unified");

  const unified = useMemo(() => {
    const list: Array<{
      id: string;
      type: string;
      operator: string;
      quantity: number;
      created_at: Date;
      item: {name?: string; code?: string; uom?: string};
      counterparty?: string;
    }> = [
      ...records.purchases.map((row: any) => ({
        id: String(row.id),
        type: "purchase",
        operator: "+",
        quantity: row.quantity,
        created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        item: row.item,
      })),
      ...records.returns.map((row: any) => ({
        id: String(row.id),
        type: "return",
        operator: "-",
        quantity: row.quantity,
        created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        item: row.item,
      })),
      ...records.issues.map((row: any) => ({
        id: String(row.id),
        type: "issue",
        operator: "-",
        quantity: row.quantity,
        created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        item: row.item,
      })),
      ...records.issueReturns.map((row: any) => ({
        id: String(row.id),
        type: "issue_return",
        operator: "+",
        quantity: row.quantity,
        created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        item: row.item,
      })),
      ...records.waste.map((row: any) => ({
        id: String(row.id),
        type: "waste",
        operator: "-",
        quantity: row.quantity,
        created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        item: row.item,
      })),
      ...records.transfersIn.map((row) => ({
        id: row.id,
        type: "transfer_in",
        operator: "+",
        quantity: row.quantity,
        created_at: row.created_at,
        item: row.item,
        counterparty: row.counterparty,
      })),
      ...records.transfersOut.map((row) => ({
        id: row.id,
        type: "transfer_out",
        operator: "-",
        quantity: row.quantity,
        created_at: row.created_at,
        item: row.item,
        counterparty: row.counterparty,
      })),
      ...records.productionOutputs.map((row) => ({
        id: row.id,
        type: "production_in",
        operator: "+",
        quantity: row.quantity,
        created_at: row.created_at,
        item: row.item,
        counterparty: row.batchNumber,
      })),
      ...records.productionInputs.map((row) => ({
        id: row.id,
        type: "production_out",
        operator: "-",
        quantity: row.quantity,
        created_at: row.created_at,
        item: row.item,
        counterparty: row.batchNumber,
      })),
      ...records.buffetConsumption.map((row) => ({
        id: row.id,
        type: row.type,
        operator: "-",
        quantity: row.quantity,
        created_at: row.created_at,
        item: {...row.item, name: item?.name, code: item?.code, uom: item?.uom},
        counterparty: row.sessionNumber,
      })),
    ];

    list.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

    return list;
  }, [records]);

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
  }), [records, t]);

  if (loading) {
    return <span className="text-gray-400">...</span>;
  }

  let total = 0;

  return (
    <>
      <span
        onClick={() => setModal(true)}
        className="underline cursor-pointer">
        {netQuantity > 0 ? netQuantity : '-'} {item?.uom}
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
          {display === 'unified' && (
            <table className="table table-hover table-sm mt-3 bg-white">
              <thead>
              <tr>
                <th>{t('common:actions.type')}</th>
                <th>{t('forms.date')}</th>
                <th>{t('buttons.item')}</th>
                <th>{t('forms.quantity')}</th>
                <th>{t('common:actions.total')}</th>
              </tr>
              </thead>
              <tbody>
              {unified.map((unifiedItem) => {
                if (isDebitType(unifiedItem.type)) {
                  total -= unifiedItem.quantity;
                } else {
                  total += unifiedItem.quantity;
                }

                return (
                  <tr key={`${unifiedItem.type}-${unifiedItem.id}`}>
                    <td className="capitalize">{unifiedItem.type.replace(/_/g, " ")}</td>
                    <td>{unifiedItem.created_at ? toLuxonDateTime(unifiedItem.created_at).toFormat(import.meta.env.VITE_DATE_FORMAT) : ""}</td>
                    <td>
                      {unifiedItem.item?.name}-{unifiedItem.item?.code}
                      {unifiedItem.counterparty ? ` → ${unifiedItem.counterparty}` : ""}
                    </td>
                    <td>{unifiedItem.operator}{unifiedItem.quantity} {unifiedItem.item?.uom}</td>
                    <td>{total} {unifiedItem.item?.uom}</td>
                  </tr>
                );
              })}
              </tbody>
              <tfoot>
              <tr>
                <th className="text-left" colSpan={4}>{t('common:actions.total')}</th>
                <th className="text-left">{total}</th>
              </tr>
              </tfoot>
            </table>
          )}

          {display === 'split' && (
            <>
              <div className="text-center text-2xl p-5 bg-gray-200 my-5">Current Quantity: {netQuantity}</div>
              <div className="overflow-x-auto">
                <div className="grid grid-cols-[repeat(10,_300px)] gap-3 mt-3">
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
                            const rowType = splitItem.type ?? type.toLowerCase().replace(/ /g, "_");
                            if (isDebitType(rowType) || type.includes(t("stockTransfer.transferOut"))) {
                              sectionTotal -= splitItem.quantity;
                            } else {
                              sectionTotal += splitItem.quantity;
                            }

                            return (
                              <tr key={splitItem.id}>
                                <td>{splitItem.created_at ? toLuxonDateTime(splitItem.created_at).toFormat(import.meta.env.VITE_DATE_FORMAT) : splitItem.created_at}</td>
                                <td>{splitItem.quantity} {splitItem.item?.uom}</td>
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
