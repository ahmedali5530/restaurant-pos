import { Layout } from "@/screens/partials/layout.tsx";
import {Printersettings} from "@/components/user_settings/printers.tsx";
import {ServiceChargesSettings} from "@/components/user_settings/service_charges.tsx";
import {CacheSettings} from "@/components/user_settings/cache.tsx";
import {TouchSettings} from "@/components/user_settings/touch.tsx";
import {MenusSettings} from "@/components/user_settings/menus.tsx";

export const Settings = () => {

  return (
    <Layout containerClassName="p-5 gap-5 grid grid-cols-2">
      <Printersettings />
      <CacheSettings />
      <MenusSettings />
      <ServiceChargesSettings />
      <TouchSettings />
    </Layout>
  );
}
