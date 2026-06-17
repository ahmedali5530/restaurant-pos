import {useStoreInventory} from "@/hooks/useStoreInventory.ts";
import {useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {Button} from "@/components/common/input/button.tsx";

export const StoreInventoryCell = ({storeId, item}: {storeId: string, item?: InventoryItem}) => {
  const { t } = useTranslation('inventory');
  const {netQuantity, loading, records} = useStoreInventory(item?.id, storeId);
  const [modal, setModal] = useState(false);
  const [display, setDisplay] = useState<"unified"|"split">("unified");

  const unified = useMemo(() => {
    const list: Pick<{item: InventoryItem, quantity: number, type: string, created_at: Date, id: string, invoice_number: number, operator: string}, any> = [
      ...records.purchases.map(item => ({...item, type: 'purchase', operator: '+'})),
      ...records.returns.map(item => ({...item, type: 'return', operator: '-'})),
      ...records.issues.map(item => ({...item, type: 'issue', operator: '-'})),
      ...records.issueReturns.map(item => ({...item, type: 'issue_return', operator: ''})),
      ...records.waste.map(item => ({...item, type: 'waste', operator: '-'}))
    ];

    list.sort((a, b) => a.created_at -  b.created_at);

    return list;
  }, [records.purchases, records.returns, records.issues, records.waste, records.issueReturns]);

  const split = useMemo(() => {
    return {
      'Purchase': records.purchases,
      'Return': records.returns,
      'Issue': records.issues,
      'Issue return': records.issueReturns,
      'Waste': records.waste
    };
  }, [records.purchases, records.returns, records.issues, records.waste, records.issueReturns])

  if (loading) {
    return <span className="text-gray-400">...</span>;
  }

  let total = 0;

  return (
    <>
      <span
        onClick={() => setModal(true)}
        className="underline cursor-pointer">
        {netQuantity > 0 ? netQuantity : '-'} {item.uom}
      </span>

      {modal && (
        <Modal
          open={true}
          onClose={() => setModal(false)}
          title={`Inventory details of ${item.name}-${item.code}`}
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
              {unified.map(unifiedItem => {
                if(unifiedItem.type === 'issue' || unifiedItem.type === 'return' || unifiedItem.type === 'waste'){
                  total -= unifiedItem.quantity;
                }else{
                  total += unifiedItem.quantity;
                }

                return (
                  <tr key={unifiedItem.id}>
                    <td className="capitalize">{unifiedItem.type}</td>
                    <td>{unifiedItem.created_at.toLocaleString()}</td>
                    <td>{unifiedItem.item.name}-{unifiedItem.item.code}</td>
                    <td>{unifiedItem.operator}{unifiedItem.quantity} {unifiedItem.item.uom}</td>
                    <td>{total} {unifiedItem.item.uom}</td>
                  </tr>
                )
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
              <div className="grid grid-cols-5 gap-3 mt-3">
              {Object.keys(split).map(type => {
                let sectionTotal = 0;
                return (
                  <div className="">
                    <h4 className="text-xl">{type}</h4>
                    <table className="table table-hover table-sm bg-white">
                      <thead>
                      <tr>
                        <th>{t('forms.date')}</th>
                        <th>{t('forms.quantity')}</th>
                      </tr>
                      </thead>
                      <tbody>
                      {split[type].map(splitItem => {
                        if(splitItem.type === 'issue' || splitItem.type === 'return' || splitItem.type === 'waste'){
                          sectionTotal -= splitItem.quantity;
                        }else{
                          sectionTotal += splitItem.quantity;
                        }

                        return (
                          <tr key={splitItem.id}>
                            <td>{splitItem.created_at.toLocaleString()}</td>
                            <td>{splitItem.quantity} {splitItem.item.uom}</td>
                          </tr>
                        )
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
                )
              })}
            </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
};