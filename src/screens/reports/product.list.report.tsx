import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";

export const ProductListReport = () => {
  const { t } = useTranslation('reports');
  return (
    <ReportsLayout
      title={t('titles.productList')}
    >
      <table className="table table-hover">

      </table>
    </ReportsLayout>
  );
}