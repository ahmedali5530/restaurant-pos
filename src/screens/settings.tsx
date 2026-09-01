import { Layout } from "@/screens/partials/layout.tsx";
import {Printersettings} from "@/components/user_settings/printers.tsx";
import {PrintOptionsSettingsCard} from "@/components/user_settings/print_options.tsx";
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
import {CurrencySymbolSettingsCard} from "@/components/user_settings/currency_symbol.tsx";
import {InventorySettingsCard} from "@/components/user_settings/inventory_settings.tsx";
import {WhatsNewSettingsCard} from "@/components/user_settings/whats_new.tsx";
import {SessionSecuritySettingsCard} from "@/components/user_settings/session_security.tsx";
import {AutoClockOutSettingsCard} from "@/components/user_settings/auto_clock_out.tsx";
import {FontSizeAdjuster} from "@/components/user_settings/font-size-adjuster.tsx";
import {useTranslation} from "react-i18next";
import {DocumentTitle} from "@/components/common/document-title.tsx";
import {PropsWithChildren} from "react";

function MasonryItem({ children }: PropsWithChildren) {
  return <div className="break-inside-avoid mb-5">{children}</div>;
}

export const Settings = () => {
  const {t: tNav} = useTranslation('navigation');

  return (
    <Layout containerClassName="p-5">
      <DocumentTitle parts={[tNav('sidebar.settings')]} />
      {/* Columns must not sit on the max-height Layout pane or content is clipped to the viewport. */}
      <div className="columns-1 md:columns-2 lg:columns-3 gap-5" data-testid="settings-page">
        <MasonryItem><WhatsNewSettingsCard /></MasonryItem>
        <MasonryItem><CacheSettings /></MasonryItem>
        <MasonryItem><LanguageSettings /></MasonryItem>
        <MasonryItem><TranslateReceiptsSettingsCard /></MasonryItem>
        <MasonryItem><Printersettings /></MasonryItem>
        <MasonryItem><PrintOptionsSettingsCard /></MasonryItem>
        <MasonryItem><MenusSettings /></MasonryItem>
        <MasonryItem><ServiceChargesSettings /></MasonryItem>
        <MasonryItem><ClosingCycleSettingsCard /></MasonryItem>
        <MasonryItem><AutoCheckCloseSettingsCard /></MasonryItem>
        <MasonryItem><SessionSecuritySettingsCard /></MasonryItem>
        <MasonryItem><AutoClockOutSettingsCard /></MasonryItem>
        <MasonryItem><ShowInclusivePricesSettingsCard /></MasonryItem>
        <MasonryItem><CurrencySymbolSettingsCard /></MasonryItem>
        <MasonryItem><TouchSettings /></MasonryItem>
        <MasonryItem><FontSizeAdjuster /></MasonryItem>
        <MasonryItem><TableSelectionSettings /></MasonryItem>
        <MasonryItem><InventorySettingsCard /></MasonryItem>
        <MasonryItem><ItemsVisibilityConfig /></MasonryItem>
      </div>
    </Layout>
  );
}
