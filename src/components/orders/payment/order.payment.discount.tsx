import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/common/input/button.tsx";
import { Discount, DiscountType } from "@/api/model/discount.ts";
import { withCurrency } from "@/lib/utils.ts";
import {useTranslation} from "react-i18next";

interface Props {
  discount?: Discount
  setDiscount: (discount?: Discount) => void
  discountAmount: number
  setDiscountAmount: (d: any) => void
  itemsTotal: number
  discountRate: number
  setDiscountRate: (rate?: number) => void
}

export const OrderPaymentDiscount = ({
  discount, setDiscount, setDiscountAmount, itemsTotal, discountAmount, setDiscountRate, discountRate
}: Props) => {
  const {t} = useTranslation('payment');

  const {
    data: discounts
  } = useApi<SettingsData<Discount>>(Tables.discounts, ['deleted_at = none'], ['priority asc'], 0, 99999);

  const keyboardKeys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0];

  const [keyboard, setKeyboard] = useState(false);
  const [draftDiscount, setDraftDiscount] = useState<Discount | undefined>(discount);
  const [draftDiscountAmount, setDraftDiscountAmount] = useState<number>(discountAmount);
  const [draftDiscountRate, setDraftDiscountRate] = useState<number>(discountRate);
  const [percentInput, setPercentInput] = useState<number | undefined>(undefined);

  const addDiscount = (discount: Discount) => {
    setKeyboard(false);
    setDraftDiscount(discount);
    setDraftDiscountAmount(discount.min_rate);
    setDraftDiscountRate(discount.min_rate);

    if(discount.type === DiscountType.Fixed){
      if(discount.min_rate === discount.max_rate){
        setDraftDiscountAmount(discount.min_rate);
        setDraftDiscountRate(discount.min_rate);
        setPercentInput(undefined);
      }else{
        setKeyboard(true);
        setPercentInput(undefined);
      }
    }else if(discount.type === DiscountType.Percent){
      if(discount.min_rate === discount.max_rate){
        setDraftDiscountAmount(discount.min_rate * itemsTotal / 100);
        setPercentInput(undefined);
        setDraftDiscountRate(discount.min_rate);
      }else{
        setKeyboard(true);
        setPercentInput(discount.min_rate);
        setDraftDiscountRate(discount.min_rate);
      }
    }
  }

  const manualDiscount = (key: number|string) => {
    if (draftDiscount?.type === DiscountType.Percent && draftDiscount.min_rate !== draftDiscount.max_rate) {
      setPercentInput((prev: number | undefined) => {
        const base = prev === undefined || prev === null ? '' : prev.toString();
        return Number(base + key);
      });
    } else {
      setDraftDiscountAmount((prev: number) => {
        return Number(prev.toString() + key);
      });
    }
  }

  useEffect(() => {
    setDraftDiscount(discount);
    setDraftDiscountAmount(discountAmount);
    setDraftDiscountRate(discountRate);
    setKeyboard(false);
    if (discount && discount.type === DiscountType.Percent && discount.min_rate !== discount.max_rate) {
      setPercentInput(discountRate || discount.min_rate);
    } else {
      setPercentInput(undefined);
    }
  }, [discount, discountAmount, discountRate]);

  const { resolvedDiscountAmount, resolvedDiscountRate } = useMemo(() => {
    if (!draftDiscount) {
      return {
        resolvedDiscountAmount: 0,
        resolvedDiscountRate: 0
      };
    }

    const hasVariableRates = draftDiscount.min_rate !== draftDiscount.max_rate;
    let finalAmount = 0;
    let finalRate = draftDiscountRate || draftDiscount.min_rate;

    if (draftDiscount.type === DiscountType.Percent) {
      const inputRate = hasVariableRates ? (percentInput ?? draftDiscount.min_rate) : draftDiscount.min_rate;
      finalRate = Math.min(Math.max(inputRate, draftDiscount.min_rate), draftDiscount.max_rate);
      finalAmount = finalRate * itemsTotal / 100;
    } else {
      finalAmount = hasVariableRates ? draftDiscountAmount : draftDiscount.min_rate;
      finalAmount = Math.min(Math.max(finalAmount, 0), draftDiscount.max_rate);
      finalRate = finalAmount;
    }

    if (hasVariableRates && draftDiscount.max_cap !== undefined && draftDiscount.max_cap !== null) {
      finalAmount = Math.min(finalAmount, draftDiscount.max_cap);
    }

    finalAmount = Math.min(finalAmount, itemsTotal);

    return {
      resolvedDiscountAmount: finalAmount,
      resolvedDiscountRate: finalRate
    };
  }, [draftDiscount, draftDiscountAmount, draftDiscountRate, itemsTotal, percentInput]);

  return (
    <div className="flex flex-col justify-between h-full">
      <div className="flex flex-col gap-5">
        <Button
          className="min-w-[150px]"
          variant="danger"
          active={draftDiscount === undefined}
          onClick={() => {
            setDraftDiscount(undefined);
            setDraftDiscountAmount(0);
            setDraftDiscountRate(0);
            setKeyboard(false);
            setPercentInput(undefined);
          }}
          size="lg"
        >
          {t('discount.noDiscount')}
        </Button>
        <div className="flex gap-5 flex-wrap">
          {discounts?.data?.map(item => (
            <Button
              className="min-w-[150px]"
              variant="primary"
              active={item.id.toString() === draftDiscount?.id.toString()}
              key={item.id}
              onClick={() => {
                addDiscount(item);
              }}
              size="lg"
            >
              {item.name}{' '}
              {/*({item.min_rate === item.max_rate ? (item.type === DiscountType.Fixed ? withCurrency(item.min_rate) : item.min_rate) : `${item.min_rate} - ${item.max_rate}`}*/}
              {/*{item.type === DiscountType.Percent && '%'})*/}
            </Button>
          ))}
        </div>
      </div>

      <div className="text-2xl text-center">
        {withCurrency(resolvedDiscountAmount)}{' '}
        {draftDiscount && draftDiscount.type === DiscountType.Percent && (
          <>({resolvedDiscountRate}%)</>
        )}
      </div>

      <div className="text-2xl text-center">
        {draftDiscount && (
          <>
            {t('discount.label')} {draftDiscount.min_rate === draftDiscount.max_rate ? (draftDiscount.type === DiscountType.Fixed ? withCurrency(draftDiscount.min_rate) : draftDiscount.min_rate) : `${draftDiscount.min_rate} - ${draftDiscount.max_rate}`}
            {draftDiscount.type === DiscountType.Percent && '%'}{' '}
            {!!draftDiscount.max_cap && t('discount.withMaxCap', {amount: withCurrency(draftDiscount.max_cap)})}
          </>
        )}
      </div>
      <div>
        {keyboard && (
          <div className="grid grid-cols-3 gap-3 mb-3">
            {keyboardKeys.map(item => (
              <Button key={item} size="xl" flat variant="primary" onClick={() => manualDiscount(item)}>
                {item}
              </Button>
            ))}
            <Button size="xl" flat variant="primary" onClick={() => {
              setDraftDiscountAmount(0);
              setPercentInput(undefined);
              setDraftDiscountRate(0);
            }}>
              C
            </Button>
          </div>
        )}
        <Button
          variant="success"
          size="lg"
          className="w-full"
          filled
          onClick={() => {
            if (!draftDiscount) {
              setDiscount(undefined);
              setDiscountAmount(0);
              setDiscountRate(0);
              return;
            }

            setDiscount(draftDiscount);
            setDiscountAmount(resolvedDiscountAmount);
            setDiscountRate(resolvedDiscountRate);
          }}
        >
          {t('common:actions.ok')}
        </Button>
      </div>
    </div>
  );
}
