import { Layout } from "@/screens/partials/layout.tsx";
import {Printersettings} from "@/components/user_settings/printers.tsx";
import {ServiceChargesSettings} from "@/components/user_settings/service_charges.tsx";
import {CacheSettings} from "@/components/user_settings/cache.tsx";
import {TouchSettings} from "@/components/user_settings/touch.tsx";
import {TableSelectionSettings} from "@/components/user_settings/table_selection.tsx";
import {MenusSettings} from "@/components/user_settings/menus.tsx";
import {AutoCheckCloseSettingsCard} from "@/components/user_settings/auto_check_close.tsx";
import {ClosingCycleSettingsCard} from "@/components/user_settings/closing_cycle.tsx";
import {LanguageSettings} from "@/components/user_settings/language.tsx";
import {ItemsVisibilityConfig} from "@/components/user_settings/items_visibility_config.tsx";

export const Settings = () => {

  return (
    <Layout containerClassName="p-5 gap-5 grid lg:grid-cols-3 md:grid-cols-2">
      <Printersettings />
      <LanguageSettings />
      <CacheSettings />
      <MenusSettings />
      <ServiceChargesSettings />
      <ClosingCycleSettingsCard />
      <AutoCheckCloseSettingsCard />
      <TouchSettings />
      <TableSelectionSettings />
      <ItemsVisibilityConfig />
    </Layout>
  );
}
