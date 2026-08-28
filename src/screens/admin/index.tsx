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
import { SecurityAlertsPanel } from "@/components/admin/security-alerts";
import { GiftCardManagement } from "@/components/admin/gift-card-management.tsx";
import { MarketingManagement } from "@/components/admin/marketing-management.tsx";
import ScrollContainer from "react-indiana-drag-scroll";
import {AdminMenus} from "@/components/settings/menu";
import {AdminPrints} from "@/components/settings/prints";
import { AdminExtras } from "@/components/settings/extras";
import { AdminCoupons } from "@/components/settings/coupons";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {useTranslation} from 'react-i18next';
import {DocumentTitle} from "@/components/common/document-title.tsx";

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
  'security_alerts',
  'gift_cards',
  'marketing',
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
  security_alerts: 'tabs.securityAlerts',
  gift_cards: 'tabs.giftCards',
  marketing: 'tabs.marketing',
};

/** Stable permission codes stored in user roles — not translated labels. */
const ADMIN_TAB_MODULES: Record<AdminTabKey, string> = {
  dishes: 'admin.dishes',
  menus: 'admin.menus',
  categories: 'admin.categories',
  modifier_groups: 'admin.modifier_groups',
  tables: 'admin.tables',
  floors: 'admin.floors',
  discounts: 'admin.discounts',
  coupons: 'admin.coupons',
  kitchens: 'admin.kitchens',
  workflows: 'admin.workflows',
  printers: 'admin.printers',
  print_settings: 'admin.print_settings',
  order_types: 'admin.order_types',
  payment_types: 'admin.payment_types',
  extras: 'admin.extras',
  taxes: 'admin.taxes',
  users: 'admin.users',
  security_alerts: 'admin.security_alerts',
  gift_cards: 'admin.gift_cards',
  marketing: 'admin.marketing',
};

export const Admin = () => {
  const [selected, setSelected] = useState<AdminTabKey>('dishes');
  const {protectAction} = useSecurity();
  const { t } = useTranslation('admin');
  const { t: tNav } = useTranslation('navigation');

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
    security_alerts: { component: <SecurityAlertsPanel/>, title: t('tabs.securityAlerts') },
    gift_cards: { component: <GiftCardManagement/>, title: t('tabs.giftCards', { defaultValue: 'Gift Cards' }) },
    marketing: { component: <MarketingManagement/>, title: t('tabs.marketing', { defaultValue: 'Marketing' }) },
  }), [t]);

  return (
    <Layout>
      <DocumentTitle parts={[pages[selected].title, tNav('sidebar.manage')]} />
      <div data-testid="admin-page">
        <Tabs
          className="w-full flex flex-col"
          selectedKey={selected}
          onSelectionChange={(key: string) => protectAction(() => setSelected(key as AdminTabKey), {
            module: ADMIN_TAB_MODULES[key as AdminTabKey],
            description: t('tabs.accessTab', { title: pages[key as AdminTabKey].title }),
          })}
        >
          <ScrollContainer mouseScroll hideScrollbars={false} className="flex-grow-0 flex-shrink">
            <TabList
              aria-label={t('tabs.ariaLabel')}
              className="flex flex-row gap-3 px-1 py-3 flex-nowrap"
              data-testid="admin-tabs"
            >
              {ADMIN_TAB_KEYS.map(key => (
                <Tab
                  id={key}
                  key={key}
                  data-testid={`admin-tab-${key}`}
                >{t(TAB_I18N_KEYS[key])}</Tab>
              ))}
            </TabList>
          </ScrollContainer>
          {ADMIN_TAB_KEYS.map((key) => (
            <TabPanel id={key} key={key} className="bg-white shadow flex-grow flex-shrink-0">
              <div data-testid={`admin-panel-${key}`}>
                {pages[key].component}
              </div>
            </TabPanel>
          ))}
        </Tabs>
      </div>
    </Layout>
  )
}
