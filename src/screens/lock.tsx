import { useTranslation } from "react-i18next";

export const Lock = () => {
  const { t } = useTranslation('common');

  return (
    <>
      <p>{t('lock.lockedBy', { name: 'Kashif' })}</p>
      <p>{t('lock.onlyUserCanLogin', { name: 'Kashif' })}</p>
    </>
  );
}
