import {useSetAtom} from 'jotai';
import {useTranslation} from 'react-i18next';
import {whatsNewOpenRequest} from '@/store/jotai.ts';
import {LATEST_RELEASE_DATE} from '@/whats-new/releases.ts';
import {Button} from '@/components/common/input/button.tsx';

export const WhatsNewSettingsCard = () => {
  const {t} = useTranslation('settings');
  const setForceOpen = useSetAtom(whatsNewOpenRequest);

  return (
    <div className="shadow p-5 rounded-xl bg-white" data-testid="settings-card-whats-new">
      <div className="flex items-start mb-5">
        <div>
          <h2 className="text-xl font-semibold mb-1">{t('whatsNew.title')}</h2>
          <p className="text-sm text-neutral-500">{t('whatsNew.description')}</p>
        </div>
      </div>
      <p className="text-sm text-neutral-600 mb-4">
        {t('whatsNew.dateLabel', {date: LATEST_RELEASE_DATE})}
      </p>
      <Button variant="primary" size="lg" onClick={() => setForceOpen(true)}>
        {t('whatsNew.open')}
      </Button>
    </div>
  );
};
