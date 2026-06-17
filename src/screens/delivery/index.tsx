import {TabList, Tabs} from "react-aria-components";
import {Tab, TabPanel} from "@/components/common/react-aria/tabs.tsx";
import {useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {Delivery} from "@/screens/delivery/delivery.tsx";
import {DeliverySettings} from "@/screens/delivery/settings.tsx";
import {Layout} from "@/screens/partials/layout.tsx";
import {DeliveryAreas} from "@/screens/delivery/delivery.areas.tsx";
import {useSecurity} from "@/hooks/useSecurity.ts";

/** Stable permission codes stored in user roles — not translated labels. */
const DELIVERY_TAB_MODULES: Record<string, string> = {
  delivery: 'Delivery orders',
  areas: 'Delivery areas',
  settings: 'Delivery settings',
};

export const Index = () => {
  const { t } = useTranslation('delivery');
  const [selected, setSelected] = useState('delivery');
  const {protectAction} = useSecurity();

  const pages = useMemo(() => ({
    'delivery': {component: <Delivery/>, title: t('tabs.delivery')},
    'areas': {component: <DeliveryAreas/>, title: t('tabs.areas')},
    'settings': {component: <DeliverySettings/>, title: t('tabs.settings')},
  }), [t]);

  return (
    <Layout>
      <Tabs
        className="w-full flex flex-col rounded-xl"
        selectedKey={selected}
        onSelectionChange={(key: string) => {
          protectAction(() => setSelected(key), {
            module: DELIVERY_TAB_MODULES[key],
            description: t('security.accessTab', { module: pages[key].title })
          });
        }}
      >
        <TabList aria-label="Tabs"
                 className="flex flex-row gap-3 px-1 py-3 flex-nowrap">
          {Object.keys(pages).map(key => (
            <Tab id={key} key={key}>{pages[key].title}</Tab>
          ))}
        </TabList>
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
