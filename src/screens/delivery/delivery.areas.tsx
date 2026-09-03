import {useCallback, useEffect, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {toast} from "sonner";
import {APIProvider, Map, useMap} from "@vis.gl/react-google-maps";

interface MapArea {
  type: string;
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

type DrawingMode = "polygon" | "rectangle" | "circle" | null;
type EditableOverlay = google.maps.Polygon | google.maps.Rectangle | google.maps.Circle;

type GeoPolygonCoordinates = number[][][];
type GeoMultiPolygonCoordinates = number[][][][];

interface NormalizedGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: GeoPolygonCoordinates | GeoMultiPolygonCoordinates;
}

const DEFAULT_STYLE: google.maps.PolygonOptions = {
  strokeColor: "#3388ff",
  strokeOpacity: 0.9,
  strokeWeight: 2,
  fillColor: "#3388ff",
  fillOpacity: 0.2,
  clickable: true,
  editable: true,
  draggable: true
};

const RECTANGLE_CIRCLE_STYLE = {
  strokeColor: "#3388ff",
  strokeOpacity: 0.9,
  strokeWeight: 2,
  fillColor: "#3388ff",
  fillOpacity: 0.2,
  editable: true,
  draggable: true
};

const PREVIEW_STYLE = {
  strokeColor: "#3388ff",
  strokeOpacity: 0.9,
  strokeWeight: 2,
  fillColor: "#3388ff",
  fillOpacity: 0.15,
  clickable: false,
  editable: false,
  draggable: false,
  zIndex: 1
};

const MIN_SHAPE_SIZE_METERS = 20;
const FREEHAND_SAMPLE_METERS = 25;
const SIMPLIFY_TOLERANCE_METERS = 15;
const MAX_EDIT_VERTICES = 24;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const latLngToLiteral = (latLng: google.maps.LatLng): google.maps.LatLngLiteral => ({
  lat: latLng.lat(),
  lng: latLng.lng()
});

const haversineDistance = (a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral): number => {
  const earthRadius = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
};

const perpendicularDistance = (
  point: google.maps.LatLngLiteral,
  lineStart: google.maps.LatLngLiteral,
  lineEnd: google.maps.LatLngLiteral
): number => {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;
  if (dx === 0 && dy === 0) return haversineDistance(point, lineStart);

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.lng - lineStart.lng) * dx + (point.lat - lineStart.lat) * dy) / (dx * dx + dy * dy)
    )
  );
  const projection = {
    lat: lineStart.lat + t * dy,
    lng: lineStart.lng + t * dx
  };
  return haversineDistance(point, projection);
};

const simplifyPath = (
  points: google.maps.LatLngLiteral[],
  toleranceMeters: number
): google.maps.LatLngLiteral[] => {
  if (points.length <= 3) return points;

  let maxDistance = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const distance = perpendicularDistance(points[i], points[0], points[end]);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }

  if (maxDistance > toleranceMeters) {
    const left = simplifyPath(points.slice(0, index + 1), toleranceMeters);
    const right = simplifyPath(points.slice(index), toleranceMeters);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[end]];
};

const limitVertices = (
  points: google.maps.LatLngLiteral[],
  maxVertices: number
): google.maps.LatLngLiteral[] => {
  let simplified = points;
  let tolerance = SIMPLIFY_TOLERANCE_METERS;

  while (simplified.length > maxVertices && tolerance < 500) {
    simplified = simplifyPath(points, tolerance);
    tolerance *= 1.5;
  }

  return simplified.length >= 3 ? simplified : points.slice(0, maxVertices);
};

const detectCircleFromRing = (
  path: google.maps.LatLngLiteral[]
): {center: google.maps.LatLngLiteral; radius: number} | null => {
  if (path.length < 24) return null;

  const center = path.reduce(
    (acc, point) => ({lat: acc.lat + point.lat, lng: acc.lng + point.lng}),
    {lat: 0, lng: 0}
  );
  center.lat /= path.length;
  center.lng /= path.length;

  const radii = path.map((point) => haversineDistance(center, point));
  const avgRadius = radii.reduce((sum, r) => sum + r, 0) / radii.length;
  if (avgRadius < MIN_SHAPE_SIZE_METERS) return null;

  const maxDeviation = radii.reduce(
    (max, radius) => Math.max(max, Math.abs(radius - avgRadius)),
    0
  );

  if (maxDeviation / avgRadius > 0.08) return null;
  return {center, radius: avgRadius};
};

const ringToPath = (ring: unknown): google.maps.LatLngLiteral[] | null => {
  if (!Array.isArray(ring)) return null;
  const path: google.maps.LatLngLiteral[] = [];

  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) return null;
    const lng = toNumber(point[0]);
    const lat = toNumber(point[1]);
    if (lat === null || lng === null) return null;
    path.push({lat, lng});
  }

  return path.length > 2 ? path : null;
};

const normalizeAreaGeometry = (area: MapArea): NormalizedGeometry | null => {
  const candidate = area.type === "Feature" && (area as any).geometry ? (area as any).geometry : area.geometry ?? area;

  if (!candidate || typeof candidate !== "object") return null;
  const geometryType = (candidate as any).type;
  const coordinates = (candidate as any).coordinates;

  if ((geometryType === "Polygon" || geometryType === "MultiPolygon") && Array.isArray(coordinates)) {
    return {type: geometryType, coordinates};
  }

  if (area.type === "Polygon" && Array.isArray((area as any).coordinates)) {
    return {type: "Polygon", coordinates: (area as any).coordinates};
  }

  if (area.type === "MultiPolygon" && Array.isArray((area as any).coordinates)) {
    return {type: "MultiPolygon", coordinates: (area as any).coordinates};
  }

  return null;
};

const closeRing = (ring: number[][]): number[][] => {
  if (ring.length < 3) return ring;
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  if (firstLng === lastLng && firstLat === lastLat) return ring;
  return [...ring, [firstLng, firstLat]];
};

const circleToPolygonGeometry = (circle: google.maps.Circle): MapArea["geometry"] | null => {
  const center = circle.getCenter();
  const radius = circle.getRadius();
  if (!center || !Number.isFinite(radius)) return null;

  const points = 64;
  const coordinates: number[][] = [];

  for (let i = 0; i <= points; i++) {
    const angle = (i * 360) / points;
    const rad = (angle * Math.PI) / 180;
    const lat = center.lat() + (radius / 111320) * Math.cos(rad);
    const lng = center.lng() + (radius / (111320 * Math.cos((center.lat() * Math.PI) / 180))) * Math.sin(rad);
    coordinates.push([lng, lat]);
  }

  return {
    type: "Polygon",
    coordinates: [coordinates]
  };
};

const overlayToArea = (overlay: EditableOverlay): MapArea | null => {
  if (overlay instanceof google.maps.Polygon) {
    const rings: number[][][] = [];
    const paths = overlay.getPaths();
    for (let i = 0; i < paths.getLength(); i++) {
      const path = paths.getAt(i);
      const ring: number[][] = [];
      for (let j = 0; j < path.getLength(); j++) {
        const point = path.getAt(j);
        ring.push([point.lng(), point.lat()]);
      }
      if (ring.length >= 3) rings.push(closeRing(ring));
    }

    if (!rings.length) return null;
    return {type: "Polygon", geometry: {type: "Polygon", coordinates: rings}};
  }

  if (overlay instanceof google.maps.Rectangle) {
    const bounds = overlay.getBounds();
    if (!bounds) return null;

    const north = bounds.getNorthEast().lat();
    const east = bounds.getNorthEast().lng();
    const south = bounds.getSouthWest().lat();
    const west = bounds.getSouthWest().lng();

    return {
      type: "Polygon",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south]
        ]]
      }
    };
  }

  if (overlay instanceof google.maps.Circle) {
    const geometry = circleToPolygonGeometry(overlay);
    if (!geometry) return null;
    return {type: "Polygon", geometry};
  }

  return null;
};

const boundsFromCorners = (
  start: google.maps.LatLngLiteral,
  end: google.maps.LatLngLiteral
): google.maps.LatLngBoundsLiteral => ({
  north: Math.max(start.lat, end.lat),
  south: Math.min(start.lat, end.lat),
  east: Math.max(start.lng, end.lng),
  west: Math.min(start.lng, end.lng)
});

interface DeliveryAreasEditorProps {
  mapAreas: MapArea[];
  onSaveAreas: (areas: MapArea[]) => Promise<void>;
}

const DeliveryAreasEditor = ({mapAreas, onSaveAreas}: DeliveryAreasEditorProps) => {
  const { t } = useTranslation('delivery');
  const map = useMap();
  const overlaysRef = useRef<Set<EditableOverlay>>(new Set());
  const listenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const selectedOverlayRef = useRef<EditableOverlay | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawingModeRef = useRef<DrawingMode>(null);
  const isDrawingRef = useRef(false);
  const dragStartRef = useRef<google.maps.LatLngLiteral | null>(null);
  const freehandPathRef = useRef<google.maps.LatLngLiteral[]>([]);
  const previewRectangleRef = useRef<google.maps.Rectangle | null>(null);
  const previewCircleRef = useRef<google.maps.Circle | null>(null);
  const previewPolylineRef = useRef<google.maps.Polyline | null>(null);
  const isOverlayDraggingRef = useRef(false);
  const addOverlayRef = useRef<(overlay: EditableOverlay) => void>(() => {});
  const [selectedVersion, setSelectedVersion] = useState(0);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(null);
  const [mapsReady, setMapsReady] = useState(false);

  const clearListeners = useCallback(() => {
    listenersRef.current.forEach((listener) => listener.remove());
    listenersRef.current = [];
  }, []);

  const resetOverlaySelectionStyle = useCallback((overlay: EditableOverlay) => {
    if (overlay instanceof google.maps.Polygon || overlay instanceof google.maps.Rectangle) {
      overlay.setOptions({...DEFAULT_STYLE, zIndex: 1, draggable: true, editable: true});
    } else if (overlay instanceof google.maps.Circle) {
      overlay.setOptions({...RECTANGLE_CIRCLE_STYLE, zIndex: 1});
    }
  }, []);

  const applyOverlaySelectionStyle = useCallback((overlay: EditableOverlay) => {
    if (overlay instanceof google.maps.Polygon || overlay instanceof google.maps.Rectangle) {
      overlay.setOptions({
        ...DEFAULT_STYLE,
        strokeColor: "#1d4ed8",
        fillColor: "#60a5fa",
        zIndex: 2,
        draggable: true,
        editable: true
      });
    } else if (overlay instanceof google.maps.Circle) {
      overlay.setOptions({
        ...RECTANGLE_CIRCLE_STYLE,
        strokeColor: "#1d4ed8",
        fillColor: "#60a5fa",
        fillOpacity: 0.25,
        zIndex: 2
      });
    }
  }, []);

  const setSelectedOverlay = useCallback(
    (overlay: EditableOverlay | null) => {
      if (selectedOverlayRef.current && selectedOverlayRef.current !== overlay) {
        resetOverlaySelectionStyle(selectedOverlayRef.current);
      }

      selectedOverlayRef.current = overlay;
      if (overlay) applyOverlaySelectionStyle(overlay);
      setSelectedVersion((v) => v + 1);
    },
    [applyOverlaySelectionStyle, resetOverlaySelectionStyle]
  );

  const serializeAndSave = useCallback(async () => {
    const areas: MapArea[] = [];
    overlaysRef.current.forEach((overlay) => {
      const area = overlayToArea(overlay);
      if (area) areas.push(area);
    });

    await onSaveAreas(areas);
  }, [onSaveAreas]);

  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      serializeAndSave().catch((error) => {
        console.error("Error saving delivery areas:", error);
        toast.error(t('toast:delivery.mapAreasSaveFailed'));
      });
    }, 300);
  }, [serializeAndSave]);

  const setMapDrawingActive = useCallback(
    (active: boolean) => {
      if (!map) return;
      map.setOptions({
        draggable: !active,
        disableDoubleClickZoom: active
      });
    },
    [map]
  );

  const clearDrawingPreview = useCallback(() => {
    previewRectangleRef.current?.setMap(null);
    previewRectangleRef.current = null;
    previewCircleRef.current?.setMap(null);
    previewCircleRef.current = null;
    previewPolylineRef.current?.setMap(null);
    previewPolylineRef.current = null;
    freehandPathRef.current = [];
    dragStartRef.current = null;
    isDrawingRef.current = false;
    setMapDrawingActive(false);
  }, [setMapDrawingActive]);

  const setDrawingModeState = useCallback(
    (mode: DrawingMode) => {
      drawingModeRef.current = mode;
      setDrawingMode(mode);
    },
    []
  );

  const clearActiveDraw = useCallback(() => {
    previewRectangleRef.current?.setMap(null);
    previewRectangleRef.current = null;
    previewCircleRef.current?.setMap(null);
    previewCircleRef.current = null;
    previewPolylineRef.current?.setMap(null);
    previewPolylineRef.current = null;
    freehandPathRef.current = [];
    dragStartRef.current = null;
    isDrawingRef.current = false;
    setMapDrawingActive(false);
  }, [setMapDrawingActive]);

  const cancelDrawing = useCallback(() => {
    clearDrawingPreview();
    setDrawingModeState(null);
  }, [clearDrawingPreview, setDrawingModeState]);

  const exitDrawingMode = useCallback(() => {
    clearActiveDraw();
    setDrawingModeState(null);
  }, [clearActiveDraw, setDrawingModeState]);

  const addOverlay = useCallback(
    (overlay: EditableOverlay) => {
      overlaysRef.current.add(overlay);

      if (overlay instanceof google.maps.Polygon) {
        overlay.setOptions({...DEFAULT_STYLE});
      } else if (overlay instanceof google.maps.Rectangle || overlay instanceof google.maps.Circle) {
        overlay.setOptions({...RECTANGLE_CIRCLE_STYLE});
      }

      listenersRef.current.push(
        overlay.addListener("click", (event: google.maps.MapMouseEvent) => {
          event.stop();
          if (drawingModeRef.current) exitDrawingMode();
          setSelectedOverlay(overlay);
        })
      );

      listenersRef.current.push(
        overlay.addListener("dragstart", () => {
          isOverlayDraggingRef.current = true;
          if (drawingModeRef.current) exitDrawingMode();
        })
      );

      listenersRef.current.push(overlay.addListener("dragend", () => {
        isOverlayDraggingRef.current = false;
        scheduleSave();
      }));

      if (overlay instanceof google.maps.Polygon) {
        const paths = overlay.getPaths();
        for (let i = 0; i < paths.getLength(); i++) {
          const path = paths.getAt(i);
          listenersRef.current.push(path.addListener("set_at", scheduleSave));
          listenersRef.current.push(path.addListener("insert_at", scheduleSave));
          listenersRef.current.push(path.addListener("remove_at", scheduleSave));
        }
      }

      if (overlay instanceof google.maps.Rectangle) {
        listenersRef.current.push(
          overlay.addListener("bounds_changed", () => {
            if (!isOverlayDraggingRef.current) scheduleSave();
          })
        );
      }

      if (overlay instanceof google.maps.Circle) {
        listenersRef.current.push(
          overlay.addListener("radius_changed", scheduleSave)
        );
        listenersRef.current.push(
          overlay.addListener("center_changed", () => {
            if (!isOverlayDraggingRef.current) scheduleSave();
          })
        );
      }
    },
    [exitDrawingMode, scheduleSave, setSelectedOverlay]
  );

  addOverlayRef.current = addOverlay;

  const createOverlayFromPath = useCallback(
    (path: google.maps.LatLngLiteral[]) => {
      if (!map) return;

      const circle = detectCircleFromRing(path);
      if (circle) {
        const overlay = new google.maps.Circle({
          map,
          center: circle.center,
          radius: circle.radius,
          ...RECTANGLE_CIRCLE_STYLE
        });
        addOverlay(overlay);
        return;
      }

      const simplified = limitVertices(simplifyPath(path, SIMPLIFY_TOLERANCE_METERS), MAX_EDIT_VERTICES);
      if (simplified.length < 3) {
        toast.error(t('map.shapeTooSmall'));
        return;
      }

      const polygon = new google.maps.Polygon({
        ...DEFAULT_STYLE,
        paths: simplified,
        map
      });
      addOverlay(polygon);
    },
    [addOverlay, map]
  );

  const startDrawing = useCallback(
    (mode: DrawingMode) => {
      if (drawingModeRef.current === mode) {
        cancelDrawing();
        return;
      }
      clearDrawingPreview();
      setSelectedOverlay(null);
      setDrawingModeState(mode);
    },
    [cancelDrawing, clearDrawingPreview, setDrawingModeState, setSelectedOverlay]
  );

  const handleDrawStart = useCallback(
    (latLng: google.maps.LatLng) => {
      const mode = drawingModeRef.current;
      if (!map || !mode) return;

      const start = latLngToLiteral(latLng);
      dragStartRef.current = start;
      isDrawingRef.current = true;
      setMapDrawingActive(true);

      if (mode === "rectangle") {
        previewRectangleRef.current = new google.maps.Rectangle({
          map,
          bounds: boundsFromCorners(start, start),
          ...PREVIEW_STYLE
        });
        return;
      }

      if (mode === "circle") {
        previewCircleRef.current = new google.maps.Circle({
          map,
          center: start,
          radius: 1,
          ...PREVIEW_STYLE
        });
        return;
      }

      freehandPathRef.current = [start];
      previewPolylineRef.current = new google.maps.Polyline({
        map,
        path: [start],
        ...PREVIEW_STYLE
      });
    },
    [map, setMapDrawingActive]
  );

  const handleDrawMove = useCallback(
    (latLng: google.maps.LatLng) => {
      if (!isDrawingRef.current || !dragStartRef.current) return;

      const mode = drawingModeRef.current;
      const current = latLngToLiteral(latLng);

      if (mode === "rectangle") {
        previewRectangleRef.current?.setOptions({
          bounds: boundsFromCorners(dragStartRef.current, current)
        });
        return;
      }

      if (mode === "circle") {
        const radius = haversineDistance(dragStartRef.current, current);
        previewCircleRef.current?.setRadius(Math.max(radius, 1));
        return;
      }

      const path = freehandPathRef.current;
      const last = path[path.length - 1];
      if (!last || haversineDistance(last, current) >= FREEHAND_SAMPLE_METERS) {
        path.push(current);
        previewPolylineRef.current?.setPath(path);
      }
    },
    []
  );

  const handleDrawEnd = useCallback(
    (latLng: google.maps.LatLng) => {
      if (!map || !isDrawingRef.current || !dragStartRef.current) return;

      const mode = drawingModeRef.current;
      const end = latLngToLiteral(latLng);
      const start = dragStartRef.current;

      if (mode === "rectangle") {
        const bounds = boundsFromCorners(start, end);
        const north = bounds.north ?? start.lat;
        const south = bounds.south ?? start.lat;
        const east = bounds.east ?? start.lng;
        const west = bounds.west ?? start.lng;
        const width = haversineDistance({lat: north, lng: west}, {lat: north, lng: east});
        const height = haversineDistance({lat: south, lng: west}, {lat: north, lng: west});

        previewRectangleRef.current?.setMap(null);
        previewRectangleRef.current = null;

        if (width >= MIN_SHAPE_SIZE_METERS && height >= MIN_SHAPE_SIZE_METERS) {
          const rectangle = new google.maps.Rectangle({
            map,
            bounds,
            ...DEFAULT_STYLE
          });
          addOverlay(rectangle);
          scheduleSave();
        } else {
          toast.error(t('map.rectangleTooSmall'));
        }

        clearActiveDraw();
        return;
      }

      if (mode === "circle") {
        const radius = haversineDistance(start, end);

        previewCircleRef.current?.setMap(null);
        previewCircleRef.current = null;

        if (radius >= MIN_SHAPE_SIZE_METERS) {
          const circle = new google.maps.Circle({
            map,
            center: start,
            radius,
            ...RECTANGLE_CIRCLE_STYLE
          });
          addOverlay(circle);
          scheduleSave();
        } else {
          toast.error(t('map.circleTooSmall'));
        }

        clearActiveDraw();
        return;
      }

      const path = [...freehandPathRef.current];
      previewPolylineRef.current?.setMap(null);
      previewPolylineRef.current = null;

      if (path.length < 2 || haversineDistance(start, end) < MIN_SHAPE_SIZE_METERS) {
        toast.error(t('map.polygonTooSmall'));
        clearActiveDraw();
        return;
      }

      if (haversineDistance(path[path.length - 1], end) >= FREEHAND_SAMPLE_METERS / 2) {
        path.push(end);
      }

      createOverlayFromPath(path);
      scheduleSave();
      clearActiveDraw();
    },
    [addOverlay, clearActiveDraw, createOverlayFromPath, map, scheduleSave]
  );

  useEffect(() => {
    if (!map || !globalThis.google?.maps) return;

    const mapListeners: google.maps.MapsEventListener[] = [];

    mapListeners.push(
      map.addListener("click", () => {
        if (drawingModeRef.current) return;
        setSelectedOverlay(null);
      })
    );

    return () => {
      mapListeners.forEach((listener) => listener.remove());
    };
  }, [map, setSelectedOverlay]);

  useEffect(() => {
    if (!map || !globalThis.google?.maps || !drawingMode) return;

    const mapListeners: google.maps.MapsEventListener[] = [];

    mapListeners.push(
      map.addListener("mousedown", (event: google.maps.MapMouseEvent) => {
        if (isDrawingRef.current || isOverlayDraggingRef.current) return;
        if (!event.latLng) return;
        handleDrawStart(event.latLng);
      })
    );

    mapListeners.push(
      map.addListener("mousemove", (event: google.maps.MapMouseEvent) => {
        if (!isDrawingRef.current || !event.latLng) return;
        handleDrawMove(event.latLng);
      })
    );

    mapListeners.push(
      map.addListener("mouseup", (event: google.maps.MapMouseEvent) => {
        if (!isDrawingRef.current || !event.latLng) return;
        handleDrawEnd(event.latLng);
      })
    );

    return () => {
      mapListeners.forEach((listener) => listener.remove());
      clearActiveDraw();
    };
  }, [clearActiveDraw, drawingMode, handleDrawEnd, handleDrawMove, handleDrawStart, map]);

  useEffect(() => {
    const onWindowMouseUp = () => {
      if (isDrawingRef.current) clearActiveDraw();
    };

    window.addEventListener("mouseup", onWindowMouseUp);
    return () => window.removeEventListener("mouseup", onWindowMouseUp);
  }, [clearActiveDraw]);

  useEffect(() => {
    if (!map) {
      setMapsReady(false);
      return;
    }

    if (globalThis.google?.maps) {
      setMapsReady(true);
      return;
    }

    const timer = window.setInterval(() => {
      if (globalThis.google?.maps) {
        setMapsReady(true);
        window.clearInterval(timer);
      }
    }, 50);

    return () => window.clearInterval(timer);
  }, [map]);

  useEffect(() => {
    if (!map || !mapsReady) return;

    const mapDiv = map.getDiv();
    if (!mapDiv) return;

    const triggerResize = () => {
      globalThis.google?.maps.event.trigger(map, "resize");
    };

    const observer = new ResizeObserver(triggerResize);
    observer.observe(mapDiv);
    triggerResize();

    return () => observer.disconnect();
  }, [map, mapsReady]);

  useEffect(() => {
    if (!map || !mapsReady) return;

    clearListeners();
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current.clear();
    setSelectedOverlay(null);

    const loadPaths = (paths: google.maps.LatLngLiteral[][]) => {
      const outerRing = paths[0];
      const circle = outerRing ? detectCircleFromRing(outerRing) : null;

      if (circle) {
        addOverlayRef.current(
          new google.maps.Circle({
            map,
            center: circle.center,
            radius: circle.radius,
            ...RECTANGLE_CIRCLE_STYLE
          })
        );
        return;
      }

      addOverlayRef.current(
        new google.maps.Polygon({
          ...DEFAULT_STYLE,
          paths,
          map
        })
      );
    };

    for (const area of mapAreas) {
      const normalized = normalizeAreaGeometry(area);
      if (!normalized) continue;

      if (normalized.type === "Polygon") {
        const paths = (normalized.coordinates as GeoPolygonCoordinates)
          .map(ringToPath)
          .filter((path): path is google.maps.LatLngLiteral[] => path !== null);
        if (!paths.length) continue;
        loadPaths(paths);
        continue;
      }

      for (const polygonCoordinates of normalized.coordinates as GeoMultiPolygonCoordinates) {
        const paths = polygonCoordinates
          .map(ringToPath)
          .filter((path): path is google.maps.LatLngLiteral[] => path !== null);
        if (!paths.length) continue;
        loadPaths(paths);
      }
    }
  }, [clearListeners, map, mapAreas, mapsReady, setSelectedOverlay]);

  useEffect(() => {
    return () => {
      clearListeners();
      clearDrawingPreview();
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current.clear();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [clearDrawingPreview, clearListeners]);

  const deleteSelectedOverlay = useCallback(() => {
    const selectedOverlay = selectedOverlayRef.current;
    if (!selectedOverlay) return;
    selectedOverlay.setMap(null);
    overlaysRef.current.delete(selectedOverlay);
    setSelectedOverlay(null);
    scheduleSave();
  }, [scheduleSave, setSelectedOverlay]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drawingModeRef.current) {
        event.preventDefault();
        cancelDrawing();
        return;
      }

      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (drawingModeRef.current) return;
      if (!selectedOverlayRef.current) return;
      event.preventDefault();
      deleteSelectedOverlay();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelDrawing, deleteSelectedOverlay]);

  const hasSelectedOverlay = Boolean(selectedOverlayRef.current);

  return (
    <>
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2" key={selectedVersion}>
        <div className="flex flex-row gap-1 rounded-md border border-neutral-300 bg-white p-1 shadow-sm">
          <button
            type="button"
            title={t('map.drawPolygon')}
            className={`rounded px-3 py-2 text-left text-sm font-medium ${
              drawingMode === "polygon"
                ? "bg-primary-500 text-white"
                : "text-neutral-700 hover:bg-neutral-50"
            }`}
            onClick={() => startDrawing("polygon")}
          >
            Polygon
          </button>
          <button
            type="button"
            title={t('map.drawRectangle')}
            className={`rounded px-3 py-2 text-left text-sm font-medium ${
              drawingMode === "rectangle"
                ? "bg-primary-500 text-white"
                : "text-neutral-700 hover:bg-neutral-50"
            }`}
            onClick={() => startDrawing("rectangle")}
          >
            Rectangle
          </button>
          <button
            type="button"
            title={t('map.drawCircle')}
            className={`rounded px-3 py-2 text-left text-sm font-medium ${
              drawingMode === "circle"
                ? "bg-primary-500 text-white"
                : "text-neutral-700 hover:bg-neutral-50"
            }`}
            onClick={() => startDrawing("circle")}
          >
            Circle
          </button>
        </div>

        {drawingMode && (
          <div className="max-w-xs rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-600 shadow-sm">
            {drawingMode === "rectangle" && <p>{t('map.drawRectangleHint')}</p>}
            {drawingMode === "circle" && <p>Click and drag from the center to set the radius.</p>}
            {drawingMode === "polygon" && <p>{t('map.drawPolygonHint')}</p>}
            <button
              type="button"
              className="mt-2 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              onClick={cancelDrawing}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        className={`absolute top-3 right-3 z-10 rounded-md border px-3 py-2 text-sm font-medium ${
          hasSelectedOverlay
            ? "border-danger-500 bg-danger-500 text-white hover:bg-danger-600"
            : "cursor-not-allowed border-neutral-300 bg-white text-neutral-400"
        }`}
        disabled={!hasSelectedOverlay}
        onClick={deleteSelectedOverlay}
      >
        Delete selected
      </button>
    </>
  );
};

export const DeliveryAreas = () => {
  const { t } = useTranslation('delivery');
  const db = useDB();
  const [mapAreas, setMapAreas] = useState<MapArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [center, setCenter] = useState({lat: 0, lng: 0});

  useEffect(() => {
    const loadMapAreas = async () => {
      try {
        setLoading(true);
        const [r] = await db.query(
          `SELECT * FROM ${Tables.settings} WHERE key = 'map_center' LIMIT 1`
        );
        if (r.length > 0) {
          setCenter({
            lat: r[0].values.lat,
            lng: r[0].values.lng
          });
        }

        const [result] = await db.query(
          `SELECT * FROM ${Tables.settings} WHERE key = 'map_areas' LIMIT 1`
        );

        if (result.length > 0) {
          const setting = result[0];
          if (setting.values && Array.isArray(setting.values)) {
            setMapAreas(setting.values);
          }
        }
      } catch (error) {
        console.error("Error loading map areas:", error);
        toast.error(t('toast:delivery.mapAreasLoadFailed'));
      } finally {
        setLoading(false);
      }
    };

    loadMapAreas();
  }, []);

  const saveMapAreas = useCallback(async (areas: MapArea[]) => {
    try {
      const [result] = await db.query(
        `SELECT * FROM ${Tables.settings} WHERE key = 'map_areas' LIMIT 1`
      );

      if (result.length > 0) {
        const setting = result[0];
        await db.merge(setting.id, {
          values: areas
        });
      } else {
        await db.create(Tables.settings, {
          key: "map_areas",
          values: areas,
          is_global: true
        });
      }

      toast.success(t('map.areasSaved'));
    } catch (error) {
      console.error("Error saving map areas:", error);
      toast.error(t('toast:delivery.mapAreasSaveFailed'));
    }
  }, [db]);

  return (
    <>
      <div className="p-4">
        <p className="text-xl text-neutral-600 mb-4">
          Draw delivery zones on the map. Choose a tool on the left, then click and drag to draw. Click a shape to select it, drag to move it, or use the handles to resize.
        </p>
        {loading ? (
          <div className="flex items-center justify-center h-[calc(100vh_-_70px)]">
            <div className="text-lg">{t('map.loadingAreas')}</div>
          </div>
        ) : (
          <div className="relative">
            <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
              <Map
                className="h-[calc(100vh_-_170px)] w-full rounded-lg border border-neutral-300"
                defaultCenter={center}
                defaultZoom={11}
                gestureHandling="greedy"
                disableDefaultUI
              >
                <DeliveryAreasEditor mapAreas={mapAreas} onSaveAreas={saveMapAreas}/>
              </Map>
            </APIProvider>
          </div>
        )}
      </div>
    </>
  );
};
