import {TabList, Tabs} from "react-aria-components";
import {Layout} from "@/screens/partials/layout.tsx";
import {Tab, TabPanel} from "@/components/common/react-aria/tabs";
import {useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import ScrollContainer from "react-indiana-drag-scroll";
import {InventoryItems} from "@/components/inventory/items/index.tsx";
import {InventorySuppliers} from "@/components/inventory/suppliers/index.tsx";
import {InventoryCategories} from "@/components/inventory/categories/index.tsx";
import {InventoryStores} from "@/components/inventory/stores/index.tsx";
import {InventoryItemGroups} from "@/components/inventory/item_groups/index.tsx";
import {InventoryPurchaseOrders} from "@/components/inventory/purchase_orders/index.tsx";
import {InventoryPurchases} from "@/components/inventory/purchases/index.tsx";
import {InventoryPurchaseReturns} from "@/components/inventory/purchase_returns/index.tsx";
import {InventoryIssues} from "@/components/inventory/issues/index.tsx";
import {InventoryIssueReturns} from "@/components/inventory/issue_returns/index.tsx";
import {InventoryWastes} from "@/components/inventory/wastes/index.tsx";
import {InventorySummary} from "@/components/inventory/inventory/summary.tsx";
import {useSecurity} from "@/hooks/useSecurity.ts";

/** Stable permission codes stored in user roles — not translated labels. */
const INVENTORY_TAB_MODULES: Record<string, string> = {
  inventory: 'Current Inventory',
  items: 'Items',
  suppliers: 'Suppliers',
  categories: 'Item Categories',
  stores: 'Stores',
  'item-groups': 'Item Groups',
  'purchase-orders': 'Purchase Orders',
  purchases: 'Purchases',
  'purchase-returns': 'Purchase Returns',
  issues: 'Issues',
  'issue-returns': 'Issue Returns',
  wastes: 'Wastes',
};

export const Inventory = () => {
  const { t } = useTranslation('inventory');
  const [selected, setSelected] = useState('inventory');
  const {protectAction} = useSecurity();

  const pages = useMemo(() => ({
    'inventory': {component: <InventorySummary/>, title: t('tabs.inventory')},
    'items': {component: <InventoryItems/>, title: t('tabs.items')},
    'suppliers': {component: <InventorySuppliers/>, title: t('tabs.suppliers')},
    'categories': {component: <InventoryCategories/>, title: t('tabs.categories')},
    'stores': {component: <InventoryStores/>, title: t('tabs.stores')},
    'item-groups': {component: <InventoryItemGroups/>, title: t('tabs.itemGroups')},
    'purchase-orders': {component: <InventoryPurchaseOrders/>, title: t('tabs.purchaseOrders')},
    'purchases': {component: <InventoryPurchases/>, title: t('tabs.purchases')},
    'purchase-returns': {component: <InventoryPurchaseReturns/>, title: t('tabs.purchaseReturns')},
    'issues': {component: <InventoryIssues/>, title: t('tabs.issues')},
    'issue-returns': {component: <InventoryIssueReturns/>, title: t('tabs.issueReturns')},
    'wastes': {component: <InventoryWastes/>, title: t('tabs.wastes')},
  }), [t]);

  return (
    <Layout
      containerClassName=""
    >
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
        <ScrollContainer mouseScroll hideScrollbars={false} className="flex-grow-0 flex-shrink bg-white">
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
