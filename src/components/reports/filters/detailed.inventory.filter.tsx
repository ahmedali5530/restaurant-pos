import { useTranslation } from 'react-i18next';
import {REPORTS_DETAILED_INVENTORY} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";

const toOption = <T extends { id?: any }>(
  item: T | undefined,
  label: string
) => {
  if (!item?.id) {
    return null;
  }

  const value =
    typeof item.id === "string" ? item.id : item.id.toString?.() ?? String(item.id);

  return {
    label,
    value,
  };
};

const notNull = <T,>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

export const DetailedInventoryFilter = () => {
  const { t } = useTranslation('reports');
  const TRANSACTION_TYPES = [
    { label: t('reports.purchase'), value: "Purchase" },
    { label: t('reports.purchaseReturn'), value: "Return" },
    { label: t('reports.issue'), value: "Issue" },
    { label: t('reports.issueReturn'), value: "Issue Return" },
    { label: t('reports.waste'), value: "Waste" },
  ];
  const {data: itemsData, isLoading: loadingItems} = useApi<SettingsData<InventoryItem>>(
    Tables.inventory_items, 
    [], 
    ['name asc'], 
    0, 
    9999, 
    ['category']
  );

  return (
    <form
      action={REPORTS_DETAILED_INVENTORY}
      className="flex flex-col gap-3 items-start"
      target="_blank"
    >
      <DateRange isRequired label="Select a range" />

      <div className="w-full flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="detailed-inventory-items">{t('labels.inventoryItems')}</label>
          <ReactSelect
            id="detailed-inventory-items"
            name="items[]"
            isMulti
            isLoading={loadingItems}
            className="w-full"
            options={(itemsData?.data || [])
              .map(item => toOption(item, `${item.name}${item.code ? ` - ${item.code}` : ''}`.trim()))
              .filter(notNull)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="detailed-inventory-types">Transaction Types</label>
          <ReactSelect
            id="detailed-inventory-types"
            name="types[]"
            isMulti
            className="w-full"
            options={TRANSACTION_TYPES}
          />
        </div>
      </div>

      <Button
        variant="primary"
        filled
        type="submit"
      >{t('filters.generate')}</Button>
    </form>
  );
}

