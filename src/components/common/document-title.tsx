import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';

export function DocumentTitle({ parts }: { parts: Array<string | null | undefined> }) {
  const { t } = useTranslation('common');
  const title = [...parts.filter(Boolean), t('documentTitle.app')].join(' | ');
  return (
    <Helmet>
      <title>{title}</title>
    </Helmet>
  );
}
