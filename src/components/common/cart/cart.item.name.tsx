import {MenuItem} from "@/api/model/cart_item.ts";
import {cn, formatNumber} from "@/lib/utils.ts";
import React from "react";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";

interface Props {
  item: MenuItem
  index: number
  mainItem: MenuItem
}

export const CartItemName = ({ item, mainItem }: Omit<Props, "index">) => {
  const [{menuConfig: {showTotalInCart}}] = useAtom(appPage);

  return (
    <>
      <div className={
        cn("pl-x flex justify-between", item.isModifier ? 'text-sm' : '')
      } style={{
        '--padding': (item.level * 0.875) + 'rem'
      } as any}>
        <span className="text-ellipsis line-clamp-1">{item.dish.name}</span>
        <div className={
          cn(
            showTotalInCart ? "grid grid-cols-2 gap-2 w-[70px] text-right" : "grid grid-cols-1 w-[40px] text-right"
          )
        }>
          <span>{formatNumber(item.price)}</span>
          {showTotalInCart && (
            <span>{formatNumber(item.price * mainItem.quantity)}</span>
          )}
        </div>
      </div>
      {item.comments && (
        <div className="italic text-sm">({item.comments})</div>
      )}
      {item?.selectedGroups?.map(group =>
        <div className="border-[3px] border-l-warning-500 border-r-0 border-y-0 mb-2" key={group.out?.id}>
          {group?.selectedModifiers?.map(modifier => (
            <CartItemName key={modifier.id} item={modifier} mainItem={mainItem} />
          ))}
        </div>
      )}
    </>
  )
}
