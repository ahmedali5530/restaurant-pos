import {Switch} from "@/components/common/input/switch.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {useTranslation} from 'react-i18next';
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";


export const ItemsVisibilityConfig = () => {
  const {t} = useTranslation(['settings', 'common']);

  const [config, setConfig] = useAtom(appPage);

  return (
    <div className="shadow p-5 rounded-xl bg-white">
      <h2 className="text-xl font-semibold mb-1">{t('settings:visibilityConfig.title')}</h2>
      <p className="text-sm text-neutral-500 mb-5">
        {t('settings:visibilityConfig.description')}
      </p>

      <h3 className="mb-3">{t('settings:visibilityConfig.menu')}</h3>
      <div className="flex gap-5 flex-col mb-5">
        <div>
          <Switch
            checked={!!config.menuConfig?.enableDishSearch}
            onChange={(event) => {
              setConfig(prev => ({
                ...prev,
                menuConfig: {
                  ...prev.menuConfig,
                  enableDishSearch: event.currentTarget.checked
                }
              }))
            }}
          >
            {t('settings:visibilityConfig.enableDishSearch')}
          </Switch>
        </div>
        <div>
          <p className="text-sm font-medium mb-2">{t('settings:visibilityConfig.dishSearchType')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              variant="primary"
              active={(config.menuConfig?.dishSearchType ?? 'number') === 'number'}
              onClick={() => {
                setConfig(prev => ({
                  ...prev,
                  menuConfig: {
                    ...prev.menuConfig,
                    dishSearchType: 'number',
                  }
                }))
              }}
            >
              {t('settings:visibilityConfig.dishSearchTypeNumber')}
            </Button>
            <Button
              size="lg"
              variant="primary"
              active={(config.menuConfig?.dishSearchType ?? 'number') === 'both'}
              onClick={() => {
                setConfig(prev => ({
                  ...prev,
                  menuConfig: {
                    ...prev.menuConfig,
                    dishSearchType: 'both',
                  }
                }))
              }}
            >
              {t('settings:visibilityConfig.dishSearchTypeBoth')}
            </Button>
          </div>
        </div>
        <div>
          <Switch
            checked={config.menuConfig?.showDishNumber !== false}
            onChange={(event) => {
              setConfig(prev => ({
                ...prev,
                menuConfig: {
                  ...prev.menuConfig,
                  showDishNumber: event.currentTarget.checked
                }
              }))
            }}
          >
            {t('settings:visibilityConfig.showDishNumber')}
          </Switch>
        </div>
      </div>

      <h3 className="mb-3">{t('settings:visibilityConfig.cart')}</h3>
      <div className="flex gap-5 flex-col mb-5">
        <div>
          <Switch
            checked={!!config.menuConfig?.showTotalInCart ?? true}
            onChange={(event) => {
              setConfig(prev => ({
                ...prev,
                menuConfig: {
                  ...prev.menuConfig,
                  showTotalInCart: event.currentTarget.checked
                }
              }))
            }}
          >
            {t('settings:visibilityConfig.showTotalsInCart')}
          </Switch>
        </div>
      </div>

      <h3 className="mb-3">{t('settings:visibilityConfig.orders')}</h3>
      <div className="flex gap-5 flex-col">
        <Switch
          checked={!!config.menuConfig?.showTotalInOrderCard ?? true}
          onChange={(event) => {
            setConfig(prev => ({
              ...prev,
              menuConfig: {
                ...prev.menuConfig,
                showTotalInOrderCard: event.currentTarget.checked
              }
            }))
          }}
        >
          {t('settings:visibilityConfig.showTotalInOrderCard')}
        </Switch>

        <Switch
          checked={!!config.menuConfig?.showGroupsInOrderCard ?? true}
          onChange={(event) => {
            setConfig(prev => ({
              ...prev,
              menuConfig: {
                ...prev.menuConfig,
                showGroupsInOrderCard: event.currentTarget.checked
              }
            }))
          }}
        >
          {t('settings:visibilityConfig.showGroupsInOrderCard')}
        </Switch>

        <Switch
          checked={!!config.menuConfig?.showQuantityInOrderCard ?? true}
          onChange={(event) => {
            setConfig(prev => ({
              ...prev,
              menuConfig: {
                ...prev.menuConfig,
                showQuantityInOrderCard: event.currentTarget.checked
              }
            }))
          }}
        >
          {t('settings:visibilityConfig.showQuantityInOrderCard')}
        </Switch>

        <Switch
          checked={!!config.menuConfig?.showPriceInOrderCard ?? true}
          onChange={(event) => {
            setConfig(prev => ({
              ...prev,
              menuConfig: {
                ...prev.menuConfig,
                showPriceInOrderCard: event.currentTarget.checked
              }
            }))
          }}
        >
          {t('settings:visibilityConfig.showPriceInOrderCard')}
        </Switch>

        <Switch
          checked={!!config.menuConfig?.showModifiersInOrderCard ?? true}
          onChange={(event) => {
            setConfig(prev => ({
              ...prev,
              menuConfig: {
                ...prev.menuConfig,
                showModifiersInOrderCard: event.currentTarget.checked
              }
            }))
          }}
        >
          {t('settings:visibilityConfig.showModifiersInOrderCard')}
        </Switch>

        <Switch
          checked={!!config.menuConfig?.showModifierPriceInOrderCard ?? true}
          onChange={(event) => {
            setConfig(prev => ({
              ...prev,
              menuConfig: {
                ...prev.menuConfig,
                showModifierPriceInOrderCard: event.currentTarget.checked
              }
            }))
          }}
        >
          {t('settings:visibilityConfig.showModifierPriceInOrderCard')}
        </Switch>
      </div>
    </div>
  );
};
