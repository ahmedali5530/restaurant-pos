import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import React, {useEffect, useState} from "react";
import {Tax} from "@/api/model/tax.ts";
import {Button} from "@/components/common/input/button.tsx";
import {useTranslation} from "react-i18next";

interface Props {
  tax?: Tax
  setTax: (tax?: Tax) => void
}

export const OrderPaymentTax = ({
  tax, setTax
}: Props) => {
  const {t} = useTranslation('payment');
  const [draftTax, setDraftTax] = useState<Tax | undefined>(tax);

  const {
    data: taxes
  } = useApi<SettingsData<Tax>>(Tables.taxes, ['deleted_at = none'], ['priority asc'], 0, 99999);

  useEffect(() => {
    setDraftTax(tax);
  }, [tax]);

  return (
    <div className="flex flex-col justify-between h-full gap-5">
      <div className="flex flex-col gap-5">
        <Button
          className="min-w-[150px]"
          variant="danger"
          active={draftTax === undefined}
          onClick={() => setDraftTax(undefined)}
          size="lg"
        >
          {t('tax.noTax')}
        </Button>
        <div className="flex gap-5 flex-wrap">
          {taxes?.data?.map(item => (
            <Button
              className="min-w-[150px]"
              variant="primary"
              active={item.id.toString() === draftTax?.id.toString()}
              key={item.id.toString()}
              onClick={() => setDraftTax(item)}
              size="lg"
            >
              {item.name} {item.rate}%
            </Button>
          ))}
        </div>
      </div>
      <Button variant="success" size="lg" className="w-full" filled onClick={() => setTax(draftTax)}>
        {t('common:actions.ok')}
      </Button>
    </div>
  );
}
