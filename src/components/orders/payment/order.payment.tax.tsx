import React, {useEffect, useState} from "react";
import {Tax} from "@/api/model/tax.ts";
import {Button} from "@/components/common/input/button.tsx";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai";
import {appSettings} from "@/store/jotai.ts";

interface Props {
  tax?: Tax
  setTax: (tax?: Tax) => void
}

export const OrderPaymentTax = ({
  tax, setTax
}: Props) => {
  const {t} = useTranslation(['payment', 'common']);
  const [draftTax, setDraftTax] = useState<Tax | undefined>(tax);
  const [settings] = useAtom(appSettings);
  const taxes = settings.taxes ?? [];

  useEffect(() => {
    setDraftTax(tax);
  }, [tax]);

  return (
    <div className="flex flex-col justify-between h-full gap-5" data-testid="payment-panel-tax">
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
          {taxes.map(item => (
            <Button
              className="min-w-[150px]"
              variant="primary"
              active={draftTax?.id === item.id}
              onClick={() => setDraftTax(item)}
              key={item.id?.toString()}
              size="lg"
            >
              {item.name} ({item.rate}%)
            </Button>
          ))}
        </div>
      </div>
      <div>
        <Button variant="primary" filled size="lg" onClick={() => {
          setTax(draftTax)
        }} className="w-full" data-testid="payment-tax-apply">
          {t('common:actions.apply')}
        </Button>
      </div>
    </div>
  );
};
