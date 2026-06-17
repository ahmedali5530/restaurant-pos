import { TabList, Tabs } from "react-aria-components";
import { Layout } from "@/screens/partials/layout.tsx";
import { Tab, TabPanel } from "@/components/common/react-aria/tabs";
import { useMemo, useState } from "react";
import { AdminFloors } from "@/components/settings/floors";
import { AdminTables } from "@/components/settings/tables";
import { AdminDishes } from "@/components/settings/dishes";
import { AdminCategories } from "@/components/settings/categories";
import { AdminModifierGroups } from "@/components/settings/modifier_groups";
import { AdminDiscounts } from "@/components/settings/discounts";
import { AdminKitchens } from "@/components/settings/kitchens";
import { AdminWorkflows } from "@/components/settings/workflows";
import { AdminPrinters } from "@/components/settings/printers";
import { AdminOrderTypes } from "@/components/settings/order_types";
import { AdminPaymentTypes } from "@/components/settings/payment_types";
import { AdminTaxes } from "@/components/settings/taxes";
import { AdminUsers } from "@/components/settings/users";
import ScrollContainer from "react-indiana-drag-scroll";
import {AdminMenus} from "@/components/settings/menu";
import {AdminPrints} from "@/components/settings/prints";
import { AdminExtras } from "@/components/settings/extras";
import { AdminCoupons } from "@/components/settings/coupons";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {useTranslation} from 'react-i18next';

const ADMIN_TAB_KEYS = [
  'dishes',
  'menus',
  'categories',
  'modifier_groups',
  'tables',
  'floors',
  'discounts',
  'coupons',
  'kitchens',
  'workflows',
  'printers',
  'print_settings',
  'order_types',
  'payment_types',
  'extras',
  'taxes',
  'users',
] as const;

type AdminTabKey = (typeof ADMIN_TAB_KEYS)[number];

const TAB_I18N_KEYS: Record<AdminTabKey, string> = {
  dishes: 'tabs.dishes',
  menus: 'tabs.menus',
  categories: 'tabs.categories',
  modifier_groups: 'tabs.modifierGroups',
  tables: 'tabs.tables',
  floors: 'tabs.floors',
  discounts: 'tabs.discounts',
  coupons: 'tabs.coupons',
  kitchens: 'tabs.kitchens',
  workflows: 'tabs.workflows',
  printers: 'tabs.printers',
  print_settings: 'tabs.printSettings',
  order_types: 'tabs.orderTypes',
  payment_types: 'tabs.paymentTypes',
  extras: 'tabs.extras',
  taxes: 'tabs.taxes',
  users: 'tabs.users',
};

/** Stable permission codes stored in user roles — not translated labels. */
const ADMIN_TAB_MODULES: Record<AdminTabKey, string> = {
  dishes: 'Dishes',
  menus: 'Menus',
  categories: 'Categories',
  modifier_groups: 'Modifier Groups',
  tables: 'Tables',
  floors: 'Floors',
  discounts: 'Discounts',
  coupons: 'Coupons',
  kitchens: 'Kitchens',
  workflows: 'Workflows',
  printers: 'Printers',
  print_settings: 'Print settings',
  order_types: 'Order Types',
  payment_types: 'Payment Types',
  extras: 'Extras',
  taxes: 'Taxes',
  users: 'Users',
};

export const Admin = () => {
  const [selected, setSelected] = useState<AdminTabKey>('dishes');
  const {protectAction} = useSecurity();
  const { t } = useTranslation('admin');

  const pages = useMemo(() => ({
    dishes: { component: <AdminDishes/>, title: t('tabs.dishes') },
    menus: { component: <AdminMenus/>, title: t('tabs.menus') },
    categories: { component: <AdminCategories/>, title: t('tabs.categories') },
    modifier_groups: { component: <AdminModifierGroups/>, title: t('tabs.modifierGroups') },
    tables: { component: <AdminTables/>, title: t('tabs.tables') },
    floors: { component: <AdminFloors/>, title: t('tabs.floors') },
    discounts: { component: <AdminDiscounts/>, title: t('tabs.discounts') },
    coupons: { component: <AdminCoupons/>, title: t('tabs.coupons') },
    kitchens: { component: <AdminKitchens/>, title: t('tabs.kitchens') },
    workflows: { component: <AdminWorkflows/>, title: t('tabs.workflows') },
    printers: { component: <AdminPrinters/>, title: t('tabs.printers') },
    print_settings: { component: <AdminPrints/>, title: t('tabs.printSettings') },
    order_types: { component: <AdminOrderTypes/>, title: t('tabs.orderTypes') },
    payment_types: { component: <AdminPaymentTypes/>, title: t('tabs.paymentTypes') },
    extras: { component: <AdminExtras/>, title: t('tabs.extras') },
    taxes: { component: <AdminTaxes/>, title: t('tabs.taxes') },
    users: { component: <AdminUsers/>, title: t('tabs.users') },
  }), [t]);

  return (
    <Layout>
      <Tabs
        className="w-full flex flex-col"
        selectedKey={selected}
        onSelectionChange={(key: string) => protectAction(() => setSelected(key as AdminTabKey), {
          module: ADMIN_TAB_MODULES[key as AdminTabKey],
          description: t('tabs.accessTab', { title: pages[key as AdminTabKey].title }),
        })}
      >
        <ScrollContainer mouseScroll hideScrollbars={false} className="flex-grow-0 flex-shrink bg-white">
          <TabList aria-label={t('tabs.ariaLabel')} className="flex flex-row gap-3 px-1 py-3 flex-nowrap">
            {ADMIN_TAB_KEYS.map(key => (
              <Tab
                id={key}
                key={key}
              >{t(TAB_I18N_KEYS[key])}</Tab>
            ))}
          </TabList>
        </ScrollContainer>
        {ADMIN_TAB_KEYS.map((key) => (
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
