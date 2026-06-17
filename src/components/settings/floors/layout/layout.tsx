import { Floor } from "@/api/model/floor.ts";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Table } from "@/api/model/table.ts";
import { Tables } from "@/api/db/tables.ts";
import { FloorTable } from "@/components/settings/floors/layout/table.tsx";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/common/input/button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircle, faEquals, faMinus, faPlus, faSquare, faSquareFull } from "@fortawesome/free-solid-svg-icons";
import { Input } from "@/components/common/input/input.tsx";
import { useDB } from "@/api/db/db.ts";
import { toast } from "sonner";
import {useTranslation} from 'react-i18next';
import { DialogTrigger } from "react-aria-components";
import { Popover } from "@/components/common/react-aria/popover.tsx";
import { toRecordId } from "@/lib/utils";

interface Props {
  floor: Floor;
}

export const AdminFloorLayout = ({
  floor,
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const db = useDB();
  const {
    data: tables,
    fetchData: fetchTables
  } = useApi<SettingsData<Table>>(Tables.tables, [`floor = ${floor.id}`], ['priority asc'], 0, 99999, ['floor']);

  const [zoom, setZoom] = useState(1);
  const [layoutGap, setLayoutGap] = useState<number>(20);
  const [layoutGridWidth, setLayoutGridWidth] = useState<number | undefined>(undefined);
  const [layoutGridHeight, setLayoutGridHeight] = useState<number | undefined>(undefined);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [bulkSettings, setBulkSettings] = useState({
    width: 100,
    height: 100,
    color: "#ffffff",
    background: "#000000",
    rounded: "rounded-none",
  });

  const canZoomIn = () => zoom !== 1;
  const canZoomOut = () => zoom > 0.1;

  const safeNumber = (value: number, fallback: number, min = 0) => {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      return fallback;
    }

    return Math.max(min, value);
  };

  const calculatedGrid = useMemo(() => {
    const floorTables = tables?.data || [];
    if (!floorTables.length) {
      return { width: 0, height: 0 };
    }

    let maxWidth = 0;
    let maxHeight = 0;
    for (const item of floorTables) {
      const x = Math.max(0, Number(item.x) || 0);
      const y = Math.max(0, Number(item.y) || 0);
      const width = Math.max(10, Number(item.width) || 50);
      const height = Math.max(10, Number(item.height) || 50);
      maxWidth = Math.max(maxWidth, x + width);
      maxHeight = Math.max(maxHeight, y + height);
    }

    return { width: maxWidth, height: maxHeight };
  }, [tables?.data]);

  useEffect(() => {
    setLayoutGridWidth(undefined);
    setLayoutGridHeight(undefined);
    setSelectedTableIds([]);
    setIsMultiSelectMode(false);
  }, [floor.id]);

  useEffect(() => {
    if (layoutGridWidth === undefined && calculatedGrid.width > 0) {
      setLayoutGridWidth(calculatedGrid.width);
    }

    if (layoutGridHeight === undefined && calculatedGrid.height > 0) {
      setLayoutGridHeight(calculatedGrid.height);
    }
  }, [calculatedGrid.height, calculatedGrid.width, layoutGridHeight, layoutGridWidth]);

  const effectiveGridWidth = safeNumber(
    layoutGridWidth ?? calculatedGrid.width,
    calculatedGrid.width || 1000,
    0
  );

  const effectiveGridHeight = safeNumber(
    layoutGridHeight ?? calculatedGrid.height,
    calculatedGrid.height || 600,
    0
  );

  useEffect(() => {
    const existingIds = new Set((tables?.data || []).map((item) => item.id?.toString()));
    setSelectedTableIds((prev) => prev.filter((id) => existingIds.has(id)));
  }, [tables?.data]);

  useEffect(() => {
    if (!selectedTableIds.length || !tables?.data?.length) {
      return;
    }

    const firstSelected = tables.data.find((item) => item.id.toString() === selectedTableIds[0]);
    if (!firstSelected) {
      return;
    }

    setBulkSettings({
      width: Math.max(10, Number(firstSelected.width) || 50),
      height: Math.max(10, Number(firstSelected.height) || 50),
      color: firstSelected.color || "#ffffff",
      background: firstSelected.background || "#000000",
      rounded: firstSelected.rounded || "rounded-none",
    });
  }, [selectedTableIds, tables?.data]);

  const arrangeTablesByGrid = useCallback(async () => {
    if (!tables?.data?.length) {
      toast.info(t('toast:admin.noTablesToArrange'));
      return;
    }

    const gap = safeNumber(layoutGap, 20, 0);
    const gridWidth = effectiveGridWidth;
    let currentX = 0;
    let currentY = 0;
    let rowHeight = 0;
    let arrangedCount = 0;

    for (const item of tables.data) {
      const tableWidth = Math.max(10, Number(item.width) || 50);
      const tableHeight = Math.max(10, Number(item.height) || 50);

      if (currentX > 0 && (currentX + tableWidth) > gridWidth) {
        currentX = 0;
        currentY += rowHeight + gap;
        rowHeight = 0;
      }

      const nextX = Math.max(0, Math.min(currentX, Math.max(0, gridWidth - tableWidth)));
      const nextY = Math.max(0, currentY);
      await db.merge(item.id, { x: nextX, y: nextY });

      arrangedCount += 1;
      currentX += tableWidth + gap;
      rowHeight = Math.max(rowHeight, tableHeight);
    }

    await fetchTables();

    if (arrangedCount > 0) {
      toast.success(t('toast:admin.tablesArranged', { count: arrangedCount }));
    }
  }, [db, effectiveGridWidth, fetchTables, layoutGap, tables?.data]);

  const toggleTableSelection = useCallback((tableId: string) => {
    setSelectedTableIds((prev) => {
      if (prev.includes(tableId)) {
        return prev.filter((id) => id !== tableId);
      }

      return [...prev, tableId];
    });
  }, []);

  const applyBulkSettings = useCallback(async () => {
    if (!selectedTableIds.length) {
      toast.info(t('toast:admin.selectAtLeastOneTable'));
      return;
    }

    for (const tableId of selectedTableIds) {
      await db.merge(toRecordId(tableId), {
        width: safeNumber(bulkSettings.width, 50, 10),
        height: safeNumber(bulkSettings.height, 50, 10),
        color: bulkSettings.color,
        background: bulkSettings.background,
        rounded: bulkSettings.rounded,
      });
    }

    await fetchTables();
    toast.success(t('toast:admin.tablesUpdated', { count: selectedTableIds.length }));
  }, [bulkSettings.background, bulkSettings.color, bulkSettings.height, bulkSettings.rounded, bulkSettings.width, db, fetchTables, selectedTableIds]);

  return (
    <div className="flex justify-center items-center">
      <div
        className="h-[calc(100vh_-_80px_-_100px)] bg-neutral-50 w-[calc(100vw_-_100px)] relative bg-grid overflow-hidden">
        <div className="bg-white/90 rounded-lg p-3 flex items-end gap-3">
          <div className="w-[100px]">
            <label className="text-sm block mb-1">{t('forms.gap')}</label>
            <Input
              type="number"
              value={layoutGap}
              onChange={(e) => setLayoutGap(safeNumber(Number(e.target.value), 0, 0))}
            />
          </div>
          <div className="w-[130px]">
            <label className="text-sm block mb-1">{t('forms.gridWidth')}</label>
            <Input
              type="number"
              value={layoutGridWidth ?? calculatedGrid.width}
              onChange={(e) => setLayoutGridWidth(safeNumber(Number(e.target.value), effectiveGridWidth, 0))}
            />
          </div>
          <div className="w-[130px]">
            <label className="text-sm block mb-1">{t('forms.gridHeight')}</label>
            <Input
              type="number"
              value={layoutGridHeight ?? calculatedGrid.height}
              onChange={(e) => setLayoutGridHeight(safeNumber(Number(e.target.value), effectiveGridHeight, 0))}
            />
          </div>
          <Button onClick={arrangeTablesByGrid} variant="primary">{t('forms.arrange')}</Button>
          <div className="bg-neutral-500 w-[2px] h-[36px] mx-1"></div>
          <Button onClick={() => {
            setZoom(prev => prev + 0.1);
          }} aria-label={t('buttons.zoomIn')} variant="primary" disabled={!canZoomIn()} icon={faPlus}>{t('buttons.zoomIn')}</Button>
          <Button onClick={() => {
            setZoom(prev => prev - 0.1);
          }}  aria-label={t('buttons.zoomOut')} variant="primary" disabled={!canZoomOut()} icon={faMinus}>{t('buttons.zoomOut')}</Button>
          <Button onClick={() => {
            setZoom(1);
          }}  aria-label={t('buttons.resetZoom')} variant="primary" disabled={zoom === 1} icon={faEquals}>{t('buttons.resetZoom')}</Button>
          <div className="bg-neutral-500 w-[2px] h-[36px] mx-1"></div>
          <Button
            variant="primary"
            flat
            active={isMultiSelectMode}
            onClick={() => {
              setIsMultiSelectMode((prev) => !prev);
              setSelectedTableIds([]);
            }}
          >
            {isMultiSelectMode ? t('forms.cancelSelect') : t('forms.selectTables')}
          </Button>
          <DialogTrigger>
            <Button variant="primary" disabled={selectedTableIds.length === 0}>Bulk Edit ({selectedTableIds.length})</Button>
            <Popover>
              <div className="w-[280px] p-3 flex flex-col gap-3">
                <div className="text-sm font-medium">Update selected tables</div>
                <div>
                  <label className="text-sm block mb-1">{t('forms.width')}</label>
                  <Input
                    type="number"
                    value={bulkSettings.width}
                    onChange={(e) => setBulkSettings((prev) => ({
                      ...prev,
                      width: safeNumber(Number(e.target.value), prev.width, 0)
                    }))}
                  />
                </div>
                <div>
                  <label className="text-sm block mb-1">{t('forms.height')}</label>
                  <Input
                    type="number"
                    value={bulkSettings.height}
                    onChange={(e) => setBulkSettings((prev) => ({
                      ...prev,
                      height: safeNumber(Number(e.target.value), prev.height, 0)
                    }))}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-sm block mb-1">{t('forms.color')}</label>
                    <Input
                      type="color"
                      value={bulkSettings.color}
                      onChange={(e) => setBulkSettings((prev) => ({
                        ...prev,
                        color: e.target.value
                      }))}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-sm block mb-1">{t('forms.background')}</label>
                    <Input
                      type="color"
                      value={bulkSettings.background}
                      onChange={(e) => setBulkSettings((prev) => ({
                        ...prev,
                        background: e.target.value
                      }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm block mb-2">{t('forms.roundness')}</label>
                  <div className="flex gap-2">
                    <Button variant="primary" flat active={bulkSettings.rounded === "rounded-none"} onClick={() => {
                      setBulkSettings((prev) => ({ ...prev, rounded: "rounded-none" }));
                    }}>
                      <FontAwesomeIcon icon={faSquareFull} />
                    </Button>
                    <Button variant="primary" flat active={bulkSettings.rounded === "rounded-xl"} onClick={() => {
                      setBulkSettings((prev) => ({ ...prev, rounded: "rounded-xl" }));
                    }}>
                      <FontAwesomeIcon icon={faSquare} />
                    </Button>
                    <Button variant="primary" flat active={bulkSettings.rounded === "rounded-full"} onClick={() => {
                      setBulkSettings((prev) => ({ ...prev, rounded: "rounded-full" }));
                    }}>
                      <FontAwesomeIcon icon={faCircle} />
                    </Button>
                  </div>
                </div>
                <Button onClick={applyBulkSettings} variant="primary">Apply to Selected</Button>
              </div>
            </Popover>
          </DialogTrigger>
        </div>
        <div className="w-full h-full relative" style={{
          'transform': `scale(${zoom})`
        }}>
          <div
            className="relative border-2 border-dashed border-gray-500"
            style={{
              width: effectiveGridWidth,
              height: effectiveGridHeight,
            }}
          >
            {tables?.data?.map(table => (
              <FloorTable
                key={table.id}
                table={table}
                isEditing={!isMultiSelectMode}
                isSelected={selectedTableIds.includes(table.id.toString())}
                onClick={isMultiSelectMode ? () => toggleTableSelection(table.id.toString()) : undefined}
                boundaryWidth={effectiveGridWidth}
                boundaryHeight={effectiveGridHeight}
                onRemove={() => fetchTables()}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
