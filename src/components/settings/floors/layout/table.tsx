import { Table } from "@/api/model/table.ts";
import React, {CSSProperties, useCallback, useEffect, useMemo, useState} from "react";
import { useMove } from 'react-aria';
import { cn, withCurrency } from "@/lib/utils.ts";
import { useDB } from "@/api/db/db.ts";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { Popover } from "@/components/common/react-aria/popover.tsx";
import { DialogTrigger } from "react-aria-components";
import {
  faCircle,
  faEllipsisVertical,
  faExclamationCircle,
  faLock,
  faSquare,
  faSquareFull
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Slider } from "@/components/common/react-aria/slider.tsx";
import { Order } from "@/api/model/order.ts";
import { getOrderSettlementFigures } from "@/lib/order.ts";
import { Countdown } from "@/components/floor/countdown.tsx";
import { DateTime } from "luxon";
import { Input } from "@/components/common/input/input.tsx";
import {useTranslation} from 'react-i18next';
import { toLuxonDateTime } from "@/lib/datetime.ts";

interface Props {
  table: Table
  order?: Order
  isEditing: boolean
  canMove?: boolean
  onClick?: () => void
  onRemove?: () => void
  isLocked?: boolean
  numberOfOrders?: number
  boundaryWidth?: number
  boundaryHeight?: number
  isSelected?: boolean
  positionOverride?: { x: number; y: number }
  onGroupMove?: (deltaX: number, deltaY: number) => void
  onGroupMoveEnd?: () => void
}

export const FloorTable = ({
  table,
  isEditing,
  canMove: canMoveProp,
  onClick,
  onRemove,
  order,
  isLocked,
  numberOfOrders,
  boundaryWidth,
  boundaryHeight,
  isSelected,
  positionOverride,
  onGroupMove,
  onGroupMoveEnd,
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const db = useDB();
  const canMove = canMoveProp ?? isEditing;
  const isGroupMoving = Boolean(onGroupMove && isSelected);

  const minHeightWidth = 50;
  const maxHeightWidth = 500;

  const [settings, setSettings] = useState({
    x: table.x || 0,
    y: table.y || 0,
    height: table.height || minHeightWidth,
    width: table.width || minHeightWidth,
    color: table.color || '#ffffff',
    background: table.background || '#000000',
    rounded: table.rounded || ''
  });

  useEffect(() => {
    setSettings(prev => ({
      ...prev,
      x: table.x || 0,
      y: table.y || 0,
      height: table.height || minHeightWidth,
      width: table.width || minHeightWidth,
      color: table.color || '#ffffff',
      background: table.background || '#000000',
      rounded: table.rounded || ''
    }));
  }, [
    table.x,
    table.y,
    table.height,
    table.width,
    table.color,
    table.background,
    table.rounded
  ]);

  const getMaxX = useCallback(() => {
    if (!boundaryWidth) {
      return Number.POSITIVE_INFINITY;
    }

    return Math.max(0, boundaryWidth - settings.width);
  }, [boundaryWidth, settings.width]);

  const getMaxY = useCallback(() => {
    if (!boundaryHeight) {
      return Number.POSITIVE_INFINITY;
    }

    return Math.max(0, boundaryHeight - settings.height);
  }, [boundaryHeight, settings.height]);

  const clampAxis = useCallback((pos: number, max: number) => {
    return Math.max(0, Math.min(pos, max));
  }, []);

  const { moveProps } = useMove({
    onMove(e) {
      if (isGroupMoving) {
        onGroupMove?.(e.deltaX, e.deltaY);
        return;
      }

      if (canMove) {
        const maxX = getMaxX();
        const maxY = getMaxY();
        setSettings(prev => {
          return {
            ...prev,
            x: clampAxis(prev.x + e.deltaX, maxX),
            y: clampAxis(prev.y + e.deltaY, maxY)
          }
        });
      }
    },
    onMoveEnd() {
      if (isGroupMoving) {
        onGroupMoveEnd?.();
      }
    }
  });

  const saveTableInfo = async () => {
    await db.merge(table.id, {
      ...settings
    });
  }

  useEffect(() => {
    if (isEditing && !isGroupMoving) {
      saveTableInfo();
    }
  }, [settings, isEditing, isGroupMoving]);

  const displayX = positionOverride?.x ?? settings.x;
  const displayY = positionOverride?.y ?? settings.y;

  const removeTable = async () => {
    await db.merge(table.id, {
      floor: null
    });

    onRemove && onRemove();
  }

  const total = order ? getOrderSettlementFigures(order).grandTotalDue : 0;
  const isLateOrder = useMemo(() => {
    if( order ) {
      const diff = DateTime.now().diff(toLuxonDateTime(order.created_at)).as('hours');
      return diff >= 2;
    }

    return false;
  }, [order]);

  return (
    <div
      {...moveProps}
      tabIndex={0}
      data-testid="floor-table"
      data-table-name={`${table.name ?? ''}${table.number ?? ''}`}
      style={{
        background: settings.background,
        color: settings.color,
        height: settings.height,
        width: settings.width,
        left: clampAxis(displayX, getMaxX()),
        top: clampAxis(displayY, getMaxY()),
        borderColor: settings.color,
        '--scale': 0.95,
      } as CSSProperties}
      className={cn(
        "border absolute z-0 cursor-pointer flex flex-col justify-center items-center",
        settings.rounded,
        isSelected && "ring-4 ring-primary-500 z-10"
      )}
      onClick={() => {
        onClick && onClick();
      }}
    >
      {isSelected && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs bg-primary-500 text-white px-2 py-[2px] rounded-full">
          Selected
        </span>
      )}
      {isLocked && (
        <span
          className="absolute -top-3 -right-3 rounded-full h-6 w-6 flex items-center justify-center shadow"
          style={{
            color: table.background,
            background: table.color
          }}
        >
          <FontAwesomeIcon icon={faLock} size="sm"/>
        </span>
      )}
      {order && (
        <>
          {isLateOrder && (
            <span
              className="absolute -top-3 -left-3 rounded-full h-6 w-6 flex items-center justify-center bg-white text-danger-500 shadow"
              title={t('forms.moreThanTwoHours')}
            >
              <FontAwesomeIcon icon={faExclamationCircle} beat/>
            </span>
          )}
          <span className="text-xs font-bold rounded-2xl py-[2px] px-2 absolute -top-3 shadow-lg" style={{
            color: table.background,
            background: table.color
          }}>
            <Countdown time={order.created_at}/>
          </span>
          <div className="text-sm">({order?.user?.first_name})</div>
          {Number(numberOfOrders) > 1 && (
            <span className="text-xs font-bold rounded-2xl py-[2px] px-2 absolute -top-3 -right-3 shadow-lg" style={{
              color: table.background,
              background: table.color
            }}>{numberOfOrders}</span>
          )}
        </>
      )}
      <span className="text-2xl">{table.name}{table.number}</span>
      {order && (
        <span className="text-lg font-bold rounded-2xl py-[2px] px-2" style={{
          color: table.background,
          background: table.color
        }}>{withCurrency(total)}</span>
      )}
      {isEditing && (
        <>
          <DialogTrigger>
            <IconTooltipButton label={t('forms.tableOptions')}
              variant="custom"
              onClick={(e) => e.stopPropagation()}
              style={{
                '--background': 'black',
                '--color': 'white',
                '--border': 'transparent',
                '--height': '20px',
                '--padding': '0 8px'
              } as CSSProperties}
              className="absolute top-0 right-0"
            >
              <FontAwesomeIcon icon={faEllipsisVertical}/>
            </IconTooltipButton>
            <Popover>
              <div className="w-[250px] p-3 flex gap-5 flex-col">
                <Slider value={settings.height} label={t('forms.height')} onChange={(value) => setSettings(prev => ({
                  ...prev,
                  height: value
                }))} step={10} maxValue={maxHeightWidth} minValue={minHeightWidth}/>
                <Slider value={settings.width} label={t('forms.width')} onChange={(value) => setSettings(prev => ({
                  ...prev,
                  width: value
                }))} step={10} maxValue={maxHeightWidth} minValue={minHeightWidth}/>
                <div className="mb-3">
                  <div className="flex gap-3">
                    <IconTooltipButton label={t('forms.roundnessSquare')} variant="primary" flat active={settings.rounded === 'rounded-none'} onClick={() => {
                      setSettings(prev => ({
                        ...prev,
                        rounded: 'rounded-none'
                      }))
                    }}>
                      <FontAwesomeIcon icon={faSquareFull} size="2x"/>
                    </IconTooltipButton>
                    <IconTooltipButton label={t('forms.roundnessRounded')} variant="primary" flat active={settings.rounded === 'rounded-xl'} onClick={() => {
                      setSettings(prev => ({
                        ...prev,
                        rounded: 'rounded-xl'
                      }))
                    }}>
                      <FontAwesomeIcon icon={faSquare} size="2x"/>
                    </IconTooltipButton>
                    <IconTooltipButton label={t('forms.roundnessCircle')} variant="primary" flat active={settings.rounded === 'rounded-full'} onClick={() => {
                      setSettings(prev => ({
                        ...prev,
                        rounded: 'rounded-full'
                      }))
                    }}>
                      <FontAwesomeIcon icon={faCircle} size="2x"/>
                    </IconTooltipButton>
                  </div>
                </div>
                <div className="mb-3 flex flex-col gap-3">
                  <div>
                    <label htmlFor="color">Color</label>
                    <Input type="color" value={settings.color} id="color" onChange={(e) => {
                      setSettings(prev => ({
                        ...prev,
                        color: e.target.value
                      }));
                    }}/>
                  </div>
                  <div>
                    <label htmlFor="background">Background</label>
                    <Input type="color" value={settings.background} id="background" onChange={(e) => {
                      setSettings(prev => ({
                        ...prev,
                        background: e.target.value
                      }));
                    }}/>
                  </div>
                </div>
                {/*<Button variant="danger" onClick={removeTable}>Remove</Button>*/}
              </div>
            </Popover>
          </DialogTrigger>
        </>
      )}
    </div>
  );
}
