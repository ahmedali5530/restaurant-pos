import { DiscountType } from "@/api/model/discount.ts";
import { Button } from "@/components/common/input/button.tsx";
import React, { useEffect, useState } from "react";
import {useTranslation} from "react-i18next";

interface Props {
  tip: number;
  setTip: (tip: any) => void;

  tipType: DiscountType;
  setTipType: (type: DiscountType) => void;
}

export const OrderPaymentTip = ({
  setTip, tipType, tip, setTipType
}: Props) => {
  const {t} = useTranslation('payment');
  const [draftTip, setDraftTip] = useState<number>(tip);
  const [draftTipType, setDraftTipType] = useState<DiscountType>(tipType);

  const [quickPercentOptions] = useState([
    5, 10, 15, 20, 30, 50, 100
  ]);
  const [quickFixedOptions] = useState([
    50, 100, 500, 1000
  ]);
  const keyboardKeys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0];

  useEffect(() => {
    setDraftTip(tip);
    setDraftTipType(tipType);
  }, [tip, tipType]);

  return (
    <div className="flex flex-col justify-between h-full">
      <div className="mb-5 flex justify-between flex-col gap-5">
        <Button variant="danger" active={draftTip === 0} onClick={() => setDraftTip(0)} size="lg">{t('tip.noTip')}</Button>
        <div className="input-group">
          <Button
            size="lg" variant="primary" active={draftTipType === DiscountType.Percent}
            onClick={() => setDraftTipType(DiscountType.Percent)}
            className="min-w-[150px] flex-1"
          >
            {t('discountType.percent')}
          </Button>
          <Button
            size="lg" variant="primary" active={draftTipType === DiscountType.Fixed}
            onClick={() => setDraftTipType(DiscountType.Fixed)}
            className="min-w-[150px] flex-1"
          >
            {t('discountType.fixed')}
          </Button>
        </div>
      </div>
      {draftTipType === DiscountType.Percent && (
        <div className="flex flex-wrap gap-3 mb-3 justify-center">
          {quickPercentOptions.map(quickOption => (
            <Button
              size="lg" variant="primary" flat active={draftTipType === DiscountType.Percent && draftTip === quickOption}
              onClick={() => {
                setDraftTipType(DiscountType.Percent);
                setDraftTip(quickOption);
              }}
              className="min-w-[100px]"
              key={quickOption}
            >
              {quickOption}%
            </Button>
          ))}
        </div>
      )}

      {draftTipType === DiscountType.Fixed && (
        <div className="flex flex-wrap gap-3 mb-3 justify-center">
          {quickFixedOptions.map(quickOption => (
            <Button
              size="lg" variant="primary" flat active={draftTipType === DiscountType.Fixed && draftTip === quickOption}
              onClick={() => {
                setDraftTipType(DiscountType.Fixed);
                setDraftTip(quickOption);
              }}
              className="min-w-[100px]"
              key={quickOption}
            >
              {quickOption}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-3">
        {keyboardKeys.map(item => (
          <Button key={item} size="xl" flat variant="primary" onClick={() => {
            setDraftTip(prev => {
              return Number(prev.toString() + item)
            });
          }}>
            {item}
          </Button>
        ))}
        <Button size="xl" flat variant="primary" onClick={() => {
          setDraftTip(0)
        }}>
          C
        </Button>
      </div>
      <Button
        variant="success"
        size="lg"
        onClick={() => {
          setTipType(draftTipType);
          setTip(draftTip);
        }}
        className="w-full"
        filled
      >
        {t('common:actions.ok')}
      </Button>

    </div>
  )
}
