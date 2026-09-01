import { formatNumber } from "@/lib/utils.ts";
import React from "react";
import { OrderItem, OrderItemModifier } from "@/api/model/order_item.ts";
import { useShowInclusivePrices } from "@/hooks/useShowInclusivePrices.ts";
import {
  getOrderItemDisplayUnitPrice,
  getOrderItemModifierDisplayPrice,
} from "@/lib/order-item-display.ts";

export const OrderItemName = ({
  item, showGroups, showQuantity, showPrice, showModifierPrice, showTotal, showModifiers = true
}: {
  item: OrderItem,
  showGroups?: boolean
  showQuantity?: boolean
  showPrice?: boolean
  showTotal?: boolean
  showModifierPrice?: boolean
  showModifiers?: boolean
}) => {
  const { enabled: showInclusive } = useShowInclusivePrices();
  const unitPrice = getOrderItemDisplayUnitPrice(item, showInclusive);
  const lineTotal = unitPrice * (item.quantity || 1);

  return (
    <div className="hover:bg-neutral-200 flex-1">
      <div className="pl-x flex text-lg gap-1" style={{
        '--padding': (item.level * 0.875) + 'rem'
      } as any}>
        <span className="flex-1">{item.item.name}</span>
        <div className="flex gap-1 text-right">
          {showQuantity && <span className="flex-0 w-[50px]">{formatNumber(item.quantity)}</span>}
          {showPrice && <span className="flex-0 w-[70px]">{formatNumber(unitPrice)}</span>}
          {showTotal && (
            <span className="flex-0 w-[70px]">{formatNumber(lineTotal)}</span>
          )}
        </div>
      </div>
      {item.comments && (
        <span className="flex-1 text-sm italic text-danger-500">({item.comments})</span>
      )}
      {showModifiers && item?.modifiers?.length > 0 && (
        <div className="pl-3 flex flex-col">
          {item?.modifiers?.map((modifier, k) => (
            <OrderItemModifiers
              modifier={modifier}
              key={k}
              showGroups={showGroups}
              showPrice={showModifierPrice}
              parentItem={item}
              showInclusive={showInclusive}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const OrderItemModifiers = ({
  modifier, showGroups, showPrice, parentItem, showInclusive = false
}: {
  modifier: OrderItemModifier,
  showGroups?: boolean
  showPrice?: boolean
  parentItem?: OrderItem
  showInclusive?: boolean
}) => {
  return (
    <div key={modifier.id} className="flex flex-col kitchen-order-modifier-group">
      {showGroups && <strong>{modifier.out.name}</strong>}
      {modifier.selectedModifiers.map(selectedModifier => {
        const price = parentItem
          ? getOrderItemModifierDisplayPrice(selectedModifier.price, parentItem, showInclusive)
          : selectedModifier.price;

        return (
          <div key={selectedModifier.id} className="pl-3 text-sm">
            <div className="flex">
              <span className="flex-1">{selectedModifier.dish.name}</span>
              {showPrice && <span className="flex-0 w-[70px] text-right">{formatNumber(price)}</span>}
            </div>

            {selectedModifier?.selectedGroups?.map((selectedGroup, k) => (
              <OrderItemModifiers
                showPrice={showPrice}
                modifier={selectedGroup}
                key={k}
                parentItem={parentItem}
                showInclusive={showInclusive}
              />
            ))}
          </div>
        );
      })}
    </div>
  )
}
