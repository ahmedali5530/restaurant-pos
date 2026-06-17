import React, {useMemo, useState} from "react";
import {MenuItem, MenuItemType} from "@/api/model/cart_item.ts";
import {useAtom} from "jotai";
import {appPage, appState} from "@/store/jotai.ts";
import {cn, formatNumber} from "@/lib/utils.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faMinus, faPencil, faPlus, faTrash, faComment} from "@fortawesome/free-solid-svg-icons";
import {Button} from "@/components/common/input/button.tsx";
import {MenuDishModifiers} from "@/components/menu/modifiers.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {VirtualKeyboard} from "@/components/common/input/virtual.keyboard.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {StringRecordId} from "surrealdb";
import { nowSurrealDateTime } from "@/lib/datetime.ts";
import {CartItemName} from "@/components/common/cart/cart.item.name.tsx";
import {useTranslation} from "react-i18next";

interface Props {
  item: MenuItem
  index: number
}

export const CartItem = ({ item, index }: Props) => {
  const db = useDB();
  const { t } = useTranslation('cart');
  const [state, setState] = useAtom(appState);
  const [page, ] = useAtom(appPage);
  const [isModifiersOpen, setModifiersOpen] = useState(false);
  const [isCommentKeyboardOpen, setCommentKeyboardOpen] = useState(false);
  const [commentText, setCommentText] = useState(item.comments || "");

  const [deleteReason, setDeleteReason] = useState('');
  const [deleteComments, setDeleteComments] = useState('');

  const hasOldItems = useMemo(() => {
    return state.cart.filter(item => item.newOrOld === MenuItemType.old && item.isSelected).length > 0
  }, [state.cart]);


  const deleteOrderItem = async (item: MenuItem) => {
    // TODO: ask for pin to confirm deletion
    await db.merge(item.id, {
      deleted_at: nowSurrealDateTime()
    });

    // TODO: ask for reason and comments
    await db.create(Tables.order_voids, {
      comments: deleteComments,
      created_at: nowSurrealDateTime(),
      deleted_by: new StringRecordId(page.user.id),
      items: [item.id],
      quantity: item.quantity,
      reason: deleteReason,
      logged_in_user: new StringRecordId(page.user.id)
    });

    setState(prev => ({
      ...prev,
      cart: prev.cart.map((_item) => {
        if( item.id === _item.id ) {
          _item.deleted_at = nowSurrealDateTime();
        }

        return _item;
      })
    }))
  }

  return (
    <>
      <div
        className={cn(
          "flex rounded gap-3 cursor-pointer items-start select-none pr-2",
          item.isSelected ? 'bg-neutral-300' : (
            item.isHold ? 'bg-warning-100' : 'bg-neutral-100'
          ),
        )}
        onClick={() => {
          if(item.deleted_at === undefined && item.newOrOld === 'new') {
            setState(prev => ({
              ...prev,
              cart: prev.cart.map(ci => {
                if (ci.id === item.id) {
                  ci.isSelected = !ci.isSelected;
                }

                return ci
              })
            }))
          }
        }}
      >
        <div className="flex flex-col items-start gap-3">
          <div className="flex gap-2 items-center">
            {item.newOrOld === MenuItemType.new && (
              <>
                <Button
                  flat
                  iconButton
                  variant="primary"
                  onClick={() => {
                    setState(prev => ({
                      ...prev,
                      cart: prev.cart.map((_item) => {
                        if( item.id === _item.id ) {
                          _item.quantity++;
                        }
                        return _item;
                      })
                    }))
                  }}
                  className="!rounded-none"
                ><FontAwesomeIcon icon={faPlus}/></Button>
                <Input
                  type="number"
                  enableKeyboard
                  value={item.quantity}
                  onChange={(e) => {
                    setState(prev => ({
                      ...prev,
                      cart: prev.cart.map((_item) => {
                        if( item.id === _item.id ) {
                          _item.quantity = Number(e.target.value);
                        }
                        return _item;
                      })
                    }))
                  }}
                  className="!w-[60px] !border-0 !bg-white !rounded-none"
                />
                {item.quantity <= 1 ? (
                  <Button
                    flat
                    iconButton
                    variant={'danger'}
                    onClick={() => {
                      setState(prev => ({
                        ...prev,
                        cart: prev.cart.filter((_item) => {
                          if( item.id !== _item.id ) {
                            return _item;
                          }
                        })
                      }))
                    }}
                    className="!rounded-none"
                  ><FontAwesomeIcon icon={faTrash}/></Button>
                ) : (
                  <Button
                    flat
                    iconButton
                    variant="primary"
                    onClick={() => {
                      setState(prev => ({
                        ...prev,
                        cart: prev.cart.map((_item) => {
                          if( item.id === _item.id ) {
                            if( _item.quantity === 1 ) {
                              return _item;
                            }

                            _item.quantity--;
                          }
                          return _item;
                        })
                      }))
                    }}
                  ><FontAwesomeIcon icon={faMinus}/></Button>
                )}
              </>
            )}

            {item.newOrOld === MenuItemType.old && (
              <>
                <span className="p-2 px-3 justify-center items-center flat !bg-white">{item.quantity}</span>
                {/*{item.deleted_at === undefined && (*/}
                {/*  <Button*/}
                {/*    flat*/}
                {/*    iconButton*/}
                {/*    variant={'danger'}*/}
                {/*    onClick={() => {*/}
                {/*      deleteOrderItem(item)*/}
                {/*    }}*/}
                {/*  ><FontAwesomeIcon icon={faTrash}/></Button>*/}
                {/*)}*/}

              </>
            )}
          </div>
          {((item.newOrOld === MenuItemType.new && item?.selectedGroups?.length > 0) || (item.newOrOld === MenuItemType.new )) && (
            <div>
              {item.newOrOld === MenuItemType.new && item?.selectedGroups?.length > 0 && (
                <>
                  <Button
                    flat
                    variant="primary"
                    iconButton
                    onClick={() => {
                      setModifiersOpen(true)
                    }}
                    className="mr-2 !rounded-none"
                  ><FontAwesomeIcon icon={faPencil}/></Button>
                </>
              )}
              {item.newOrOld === MenuItemType.new && (
                <>
                  <Button
                    flat
                    variant="primary"
                    iconButton
                    onClick={() => {
                      setCommentText(item.comments || "");
                      setCommentKeyboardOpen(true);
                    }}
                    className="!rounded-none"
                  >
                    <FontAwesomeIcon icon={faComment}/>
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        <div className={
          cn(
            "flex-grow items-center",
            item.deleted_at ? 'line-through text-danger-500' : ''
          )
        }>
          <CartItemName item={item} />
        </div>
      </div>
      {isModifiersOpen && (
        <MenuDishModifiers
          isOpen={isModifiersOpen}
          dish={item.dish}
          groups={item.selectedGroups}
          level={item.level + 1}
          editing={true}
          onClose={(groups) => {
            setModifiersOpen(false);
            // update item
            setState(prev => ({
              ...prev,
              cart: prev.cart.map((cItem, cIndex) => {
                if(cIndex === index){
                  cItem.selectedGroups = groups;
                }

                return cItem;
              })
            }))
          }}
        />
      )}
      {isCommentKeyboardOpen && (
        <VirtualKeyboard
          open={isCommentKeyboardOpen}
          onClose={() => {
            setCommentKeyboardOpen(false);
            setState(prev => ({
              ...prev,
              cart: prev.cart.map((_item) => {
                if (item.id === _item.id) {
                  _item.comments = commentText;
                }
                return _item;
              })
            }));
          }}
          type="text"
          placeholder={t('seats.addComment')}
          value={commentText}
          onChange={(v) => setCommentText(v)}
        />
      )}
    </>
  );
}