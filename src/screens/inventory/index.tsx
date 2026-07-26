import {TabList, Tabs} from "react-aria-components";
import {Layout} from "@/screens/partials/layout.tsx";
import {Tab, TabPanel} from "@/components/common/react-aria/tabs";
import {useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import ScrollContainer from "react-indiana-drag-scroll";
import {InventoryItems} from "@/components/inventory/items/index.tsx";
import {InventorySuppliers} from "@/components/inventory/suppliers/index.tsx";
import {InventoryCategories} from "@/components/inventory/categories/index.tsx";
import {InventoryLocations} from "@/components/inventory/locations/index.tsx";
import {InventoryItemGroups} from "@/components/inventory/item_groups/index.tsx";
import {InventoryPurchaseOrders} from "@/components/inventory/purchase_orders/index.tsx";
import {InventoryPurchases} from "@/components/inventory/purchases/index.tsx";
import {InventoryPurchaseReturns} from "@/components/inventory/purchase_returns/index.tsx";
import {InventoryIssues} from "@/components/inventory/issues/index.tsx";
import {InventoryIssueReturns} from "@/components/inventory/issue_returns/index.tsx";
import {InventoryWastes} from "@/components/inventory/wastes/index.tsx";
import {InventoryAdjustments} from "@/components/inventory/adjustments/index.tsx";
import {InventorySummary} from "@/components/inventory/inventory/summary.tsx";
import {KitchenReconciliationScreen} from "@/components/inventory/kitchen_reconciliation/index.tsx";
import {InventoryStockTransfers} from "@/components/inventory/stock_transfers/index.tsx";
import {InventoryRecipes} from "@/components/inventory/recipes/index.tsx";
import {InventoryProduction} from "@/components/inventory/production/index.tsx";
import {InventoryProductionHistory} from "@/components/inventory/production_history/index.tsx";
import {BuffetMenus} from "@/components/inventory/buffet/menus/index.tsx";
import {BuffetSessions} from "@/components/inventory/buffet/sessions/index.tsx";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {DocumentTitle} from "@/components/common/document-title.tsx";

/** Stable permission codes stored in user roles — not translated labels. */
const INVENTORY_TAB_MODULES: Record<string, string> = {
  inventory: 'inventory.current_inventory',
  items: 'inventory.items',
  suppliers: 'inventory.suppliers',
  categories: 'inventory.item_categories',
  locations: 'inventory.locations',
  'item-groups': 'inventory.item_groups',
  'purchase-orders': 'inventory.purchase_orders',
  purchases: 'inventory.purchases',
  'purchase-returns': 'inventory.purchase_returns',
  issues: 'inventory.issues',
  'issue-returns': 'inventory.issue_returns',
  wastes: 'inventory.wastes',
  adjustments: 'inventory.adjustments',
  'kitchen-reconciliation': 'inventory.kitchen_reconciliation',
  'stock-transfers': 'inventory.stock_transfers',
  'recipes': 'inventory.production_recipes',
  'production': 'inventory.production',
  'production-history': 'inventory.production_history',
  'buffet-menus': 'inventory.buffet_menus',
  'buffet-sessions': 'inventory.buffet_sessions',
};

export const Inventory = () => {
  const { t } = useTranslation('inventory');
  const { t: tNav } = useTranslation('navigation');
  const [selected, setSelected] = useState('inventory');
  const {protectAction} = useSecurity();

  const pages = useMemo(() => ({
    'inventory': {component: <InventorySummary/>, title: t('tabs.inventory')},
    'items': {component: <InventoryItems/>, title: t('tabs.items')},
    'suppliers': {component: <InventorySuppliers/>, title: t('tabs.suppliers')},
    'categories': {component: <InventoryCategories/>, title: t('tabs.categories')},
    'locations': {component: <InventoryLocations/>, title: t('tabs.locations')},
    'item-groups': {component: <InventoryItemGroups/>, title: t('tabs.itemGroups')},
    'purchase-orders': {component: <InventoryPurchaseOrders/>, title: t('tabs.purchaseOrders')},
    'purchases': {component: <InventoryPurchases/>, title: t('tabs.purchases')},
    'purchase-returns': {component: <InventoryPurchaseReturns/>, title: t('tabs.purchaseReturns')},
    'issues': {component: <InventoryIssues/>, title: t('tabs.issues')},
    'issue-returns': {component: <InventoryIssueReturns/>, title: t('tabs.issueReturns')},
    'wastes': {component: <InventoryWastes/>, title: t('tabs.wastes')},
    'adjustments': {component: <InventoryAdjustments/>, title: t('tabs.adjustments')},
    'kitchen-reconciliation': {component: <KitchenReconciliationScreen/>, title: t('tabs.kitchenReconciliation')},
    'stock-transfers': {component: <InventoryStockTransfers/>, title: t('tabs.stockTransfers')},
    'recipes': {component: <InventoryRecipes/>, title: t('tabs.recipes')},
    'production': {component: <InventoryProduction/>, title: t('tabs.production')},
    'production-history': {component: <InventoryProductionHistory/>, title: t('tabs.productionHistory')},
    'buffet-menus': {component: <BuffetMenus/>, title: t('tabs.buffetMenus')},
    'buffet-sessions': {component: <BuffetSessions/>, title: t('tabs.buffetSessions')},
  }), [t]);

  return (
    <Layout
      containerClassName=""
    >
      <DocumentTitle parts={[pages[selected]?.title, tNav('sidebar.inventory')]} />
      <Tabs
        className="w-full flex flex-col rounded-xl"
        selectedKey={selected}
        onSelectionChange={(key: string) => {
          protectAction(() => {
            setSelected(key);
          }, {
            module: INVENTORY_TAB_MODULES[key],
            description: t('security.accessTab', { module: pages[key].title })
          });
        }}
      >
        <ScrollContainer mouseScroll hideScrollbars={false} className="flex-grow-0 flex-shrink">
          <TabList aria-label="Tabs"
                   className="flex flex-row gap-3 px-1 py-3 flex-nowrap">
            {Object.keys(pages).map(key => (
              <Tab id={key} key={key}>{pages[key].title}</Tab>
            ))}
          </TabList>
        </ScrollContainer>
        {Object.keys(pages).map((key) => (
          <TabPanel id={key} key={key} className="bg-white shadow flex-grow flex-shrink-0">
            <div>
              {pages[key].component}
            </div>
          </TabPanel>
        ))}
      </Tabs>
    </Layout>
  )
}
