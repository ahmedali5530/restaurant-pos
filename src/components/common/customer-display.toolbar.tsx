import {useAtomValue} from "jotai";
import {useTranslation} from "react-i18next";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faDisplay} from "@fortawesome/free-solid-svg-icons";
import {useDB} from "@/api/db/db.ts";
import {openCustomerDisplayWindow} from "@/hooks/useCustomerDisplayPublisher.ts";
import {appSettings, appState} from "@/store/jotai.ts";

/** App toolbar control — keeps the menu header free of the customer-display button. */
export const CustomerDisplayToolbar = () => {
  const {t} = useTranslation(["menu", "common"]);
  const db = useDB();
  const cart = useAtomValue(appState).cart;
  const taxes = useAtomValue(appSettings).taxes;
  const label = t("menu:header.customerDisplay");

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-testid="toolbar-open-customer-display"
      onClick={() => void openCustomerDisplayWindow(cart, taxes, db)}
      className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm hover:bg-surface"
    >
      <FontAwesomeIcon icon={faDisplay} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
};
