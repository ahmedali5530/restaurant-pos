/** Module cache so `withCurrency` can respect the setting without React. */
let showCurrencySymbolInUi = true;

export const setShowCurrencySymbolInUi = (show: boolean) => {
  showCurrencySymbolInUi = show;
};

export const getShowCurrencySymbolInUi = () => showCurrencySymbolInUi;
