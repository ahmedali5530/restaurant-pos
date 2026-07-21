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
import {TranslateReceiptsSettingsCard} from "@/components/user_settings/translate_receipts.tsx";
import {ItemsVisibilityConfig} from "@/components/user_settings/items_visibility_config.tsx";
import {ShowInclusivePricesSettingsCard} from "@/components/user_settings/show_inclusive_prices.tsx";
import {InventorySettingsCard} from "@/components/user_settings/inventory_settings.tsx";
import {WhatsNewSettingsCard} from "@/components/user_settings/whats_new.tsx";
import {useTranslation} from "react-i18next";
import {DocumentTitle} from "@/components/common/document-title.tsx";

export const Settings = () => {
  const {t: tNav} = useTranslation('navigation');

  return (
    <Layout containerClassName="p-5 gap-5 grid lg:grid-cols-3 md:grid-cols-2">
      <DocumentTitle parts={[tNav('sidebar.settings')]} />
      <WhatsNewSettingsCard />
      <CacheSettings />
      <LanguageSettings />
      <TranslateReceiptsSettingsCard />
      <Printersettings />
      <MenusSettings />
      <ServiceChargesSettings />
      <ClosingCycleSettingsCard />
      <AutoCheckCloseSettingsCard />
      <ShowInclusivePricesSettingsCard />
      <TouchSettings />
      <TableSelectionSettings />
      <InventorySettingsCard />
      <ItemsVisibilityConfig />
    </Layout>
  );
}
