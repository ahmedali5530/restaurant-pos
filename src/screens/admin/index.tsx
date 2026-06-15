import { TabList, Tabs } from "react-aria-components";
import { Layout } from "@/screens/partials/layout.tsx";
import { Tab, TabPanel } from "@/components/common/react-aria/tabs";
import { useState } from "react";
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

export const Admin = () => {
  const [selected, setSelected] = useState('dishes');
  const {protectAction} = useSecurity();

  const pages = {
    'dishes': { component: <AdminDishes/>, title: 'Dishes' },
    'menus': { component: <AdminMenus/>, title: 'Menus' },
    'categories': { component: <AdminCategories/>, title: 'Categories' },
    'modifier_groups': { component: <AdminModifierGroups/>, title: 'Modifier Groups' },
    'tables': { component: <AdminTables/>, title: 'Tables' },
    'floors': { component: <AdminFloors/>, title: 'Floors' },
    'discounts': { component: <AdminDiscounts/>, title: 'Discounts' },
    'coupons': { component: <AdminCoupons/>, title: 'Coupons' },
    'kitchens': { component: <AdminKitchens/>, title: 'Kitchens' },
    'workflows': { component: <AdminWorkflows/>, title: 'Workflows' },
    'printers': { component: <AdminPrinters/>, title: 'Printers' },
    'print_settings': { component: <AdminPrints/>, title: 'Print settings' },
    'order_types': { component: <AdminOrderTypes/>, title: 'Order Types' },
    'payment_types': { component: <AdminPaymentTypes/>, title: 'Payment Types' },
    'extras': { component: <AdminExtras/>, title: 'Extras' },
    'taxes': { component: <AdminTaxes/>, title: 'Taxes' },
    'users': { component: <AdminUsers/>, title: 'Users' },
  };

  return (
    <Layout>
      <Tabs
        className="w-full flex flex-col"
        selectedKey={selected}
        onSelectionChange={(key: string) => protectAction(() => setSelected(key), {
          module: pages[key].title,
          description: `Access ${pages[key].title}`,
        })}
      >
        <ScrollContainer mouseScroll hideScrollbars={false} className="flex-grow-0 flex-shrink bg-white">
          <TabList aria-label="Tabs" className="flex flex-row gap-3 px-1 py-3 flex-nowrap">
            {Object.keys(pages).map(key => (
              <Tab
                id={key}
                key={key}
              >{pages[key].title}</Tab>
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
