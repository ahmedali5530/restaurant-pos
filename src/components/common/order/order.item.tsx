import { cn, formatNumber } from "@/lib/utils.ts";
import React from "react";
import { OrderItem, OrderItemModifier } from "@/api/model/order_item.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";

export const OrderItemName = ({
  item, showGroups, showQuantity, showPrice, showModifierPrice
}: {
  item: OrderItem,
  showGroups?: boolean
  showQuantity?: boolean
  showPrice?: boolean
  showModifierPrice?: boolean
}) => {
  return (
    <div className="hover:bg-neutral-200 flex-1">
      <div className="pl-x flex text-lg gap-1" style={{
        '--padding': (item.level * 0.875) + 'rem'
      } as any}>
        <span className="flex-1">{item.item.name}</span>
        {showQuantity && <span className="flex-0 w-[50px] text-right">{formatNumber(item.quantity)}</span>}
        {showPrice && <span className="flex-0 w-[70px] text-right">{formatNumber(showModifierPrice ? item.price : calculateOrderItemPrice(item))}</span>}
      </div>
      {item.comments && (
        <span className="flex-1 text-sm italic text-danger-500">({item.comments})</span>
      )}
      {item?.modifiers?.length > 0 && (
        <div className="pl-3 flex flex-col">
          {item?.modifiers?.map(modifier => (
            <OrderItemModifiers
              modifier={modifier}
              key={modifier.id}
              showGroups={showGroups}
              showPrice={showModifierPrice}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const OrderItemModifiers = ({
  modifier, showGroups, showPrice
}: { modifier: OrderItemModifier, showGroups?: boolean, showPrice?: boolean }) => {
  return (
    <div key={modifier.id} className="flex flex-col kitchen-order-modifier-group">
      {showGroups && <strong>{modifier.out.name}</strong>}
      {modifier.selectedModifiers.map(selectedModifier => (
        <div key={selectedModifier.id} className="pl-3 text-sm">
          <div className="flex">
            <span className="flex-1">{selectedModifier.dish.name}</span>
            {showPrice && <span className="flex-0 w-[70px] text-right">{formatNumber(selectedModifier.price)}</span>}
          </div>

          {selectedModifier?.selectedGroups?.map(selectedGroup => (
            <OrderItemModifiers
              showPrice={showPrice}
              modifier={selectedGroup}
              key={selectedGroup.id}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
