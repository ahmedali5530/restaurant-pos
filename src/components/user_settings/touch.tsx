import {Button} from "@/components/common/input/button.tsx";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {useTranslation} from 'react-i18next';

export const TouchSettings = () => {
  const [page, setPage] = useAtom(appPage);
  const { t } = useTranslation(['settings', 'common']);
  return (
    <div className="shadow p-5 rounded-xl bg-surface-elevated" data-testid="settings-card-touch">
      <div className="flex items-start mb-5">
        <div>
          <h2 className="text-xl font-semibold mb-1">{t('settings:touch.title')}</h2>
          <p className="settings-card-desc">{t('settings:touch.description')}</p>
        </div>
      </div>
      <Button variant={page.touch ? 'success' : 'danger'} size="lg" onClick={() => {
        setPage(prev => ({
          ...prev,
          touch: !prev.touch
        }))
      }}>
        {page.touch ? t('common:actions.enabled') : t('common:actions.disabled')}
      </Button>
    </div>
  )
}
