import {useAtom} from 'jotai';
import {useTranslation} from 'react-i18next';
import {appPage, whatsNewOpenRequest} from '@/store/jotai.ts';
import {getLatestRelease, LATEST_RELEASE_DATE, RELEASES} from '@/whats-new/releases.ts';
import {Modal} from '@/components/common/react-aria/modal.tsx';
import {Button} from '@/components/common/input/button.tsx';

export const WhatsNewDialog = () => {
  const {t} = useTranslation('settings');
  const [page, setPage] = useAtom(appPage);
  const [forceOpen, setForceOpen] = useAtom(whatsNewOpenRequest);

  const user = page.user;
  const dismissed = page.whatsNewDismissedDate ?? page.whatsNewDismissedVersion;
  const shouldAutoOpen = !!user && !!LATEST_RELEASE_DATE && dismissed !== LATEST_RELEASE_DATE;
  const open = shouldAutoOpen || forceOpen;

  const latest = getLatestRelease();
  const priorReleases = RELEASES.slice(1, 20);

  const dismiss = () => {
    setPage((prev) => ({
      ...prev,
      whatsNewDismissedDate: LATEST_RELEASE_DATE,
      whatsNewDismissedVersion: undefined,
    }));
    setForceOpen(false);
  };

  if (!user || !latest) {
    return null;
  }

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title={latest.title ?? t('whatsNew.dialogTitle')}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-500">
          {t('whatsNew.dateLabel', {date: latest.date})}
        </p>

        <ul className="list-disc pl-5 space-y-2 text-neutral-800">
          {latest.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {priorReleases.length > 0 && (
          <div className="pt-3 border-t border-neutral-200 space-y-3 overflow-auto max-h-[calc(100vh_-_350px)]">
            <p className="text-sm font-medium text-neutral-600">{t('whatsNew.previousReleases')}</p>
            {priorReleases.map((release, index) => (
              <div key={`${release.date}-${release.title ?? index}`}>
                <p className="text-sm font-semibold text-neutral-700">
                  {release.title ?? release.date}
                  <span className="font-normal text-neutral-500">
                    {' '}
                    ({release.date})
                  </span>
                </p>
                <ul className="list-disc pl-5 mt-1 space-y-1 text-sm text-neutral-700">
                  {release.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="primary" size="lg" data-testid="whats-new-dismiss" onClick={dismiss}>
            {t('whatsNew.dismiss')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
