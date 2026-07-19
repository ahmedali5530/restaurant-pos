import {useAtom} from 'jotai';
import {useTranslation} from 'react-i18next';
import {appPage, whatsNewOpenRequest} from '@/store/jotai.ts';
import {APP_VERSION, getLatestRelease, RELEASES} from '@/whats-new/releases.ts';
import {Modal} from '@/components/common/react-aria/modal.tsx';
import {Button} from '@/components/common/input/button.tsx';

export const WhatsNewDialog = () => {
  const {t} = useTranslation('settings');
  const [page, setPage] = useAtom(appPage);
  const [forceOpen, setForceOpen] = useAtom(whatsNewOpenRequest);

  const user = page.user;
  const dismissed = page.whatsNewDismissedVersion;
  const shouldAutoOpen = !!user && dismissed !== APP_VERSION;
  const open = shouldAutoOpen || forceOpen;

  const latest = getLatestRelease();
  const priorReleases = RELEASES.filter((r) => r.version !== latest?.version).slice(0, 3);

  const dismiss = () => {
    setPage((prev) => ({
      ...prev,
      whatsNewDismissedVersion: APP_VERSION,
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
          {t('whatsNew.versionLabel', {version: latest.version})}
          {latest.date ? ` · ${latest.date}` : ''}
        </p>

        <ul className="list-disc pl-5 space-y-2 text-neutral-800">
          {latest.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {priorReleases.length > 0 && (
          <div className="pt-3 border-t border-neutral-200 space-y-3">
            <p className="text-sm font-medium text-neutral-600">{t('whatsNew.previousReleases')}</p>
            {priorReleases.map((release) => (
              <div key={release.version}>
                <p className="text-sm font-semibold text-neutral-700">
                  {release.title ?? release.version}
                  <span className="font-normal text-neutral-500">
                    {' '}
                    ({release.version}{release.date ? ` · ${release.date}` : ''})
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
          <Button variant="primary" size="lg" onClick={dismiss}>
            {t('whatsNew.dismiss')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
