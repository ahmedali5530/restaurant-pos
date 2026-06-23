import {useTranslation} from "react-i18next";

interface PageLoaderProps {
  message?: string;
}

export const PageLoader = ({message}: PageLoaderProps) => {
  const {t} = useTranslation('common');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-neutral-300 border-t-primary-600"/>
        <p className="text-gray-600">{message ?? t('database.connecting')}</p>
      </div>
    </div>
  );
};
