import {useEffect, useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDeliveryOrders} from "@/hooks/useDeliveryOrders.ts";
import {DeliveryOrderItem} from "@/components/delivery/delivery-order-item.tsx";
import {OrderStatus} from "@/api/model/order.ts";
import ScrollContainer from "react-indiana-drag-scroll";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faExclamationCircle} from "@fortawesome/free-solid-svg-icons";
import {APIProvider, Map, useMap} from "@vis.gl/react-google-maps";

interface MapArea {
  type: string;
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

type GeoPolygonCoordinates = number[][][];
type GeoMultiPolygonCoordinates = number[][][][];

interface NormalizedGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: GeoPolygonCoordinates | GeoMultiPolygonCoordinates;
}

interface DeliveryMapOverlaysProps {
  mapAreas: MapArea[];
  deliveryOrders: any[];
  openOrderPopup: (order: any) => void;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const toNumber = (value: unknown): number | null => {
  if (isFiniteNumber(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toRingPath = (ring: unknown): google.maps.LatLngLiteral[] | null => {
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

const getOrderCoordinates = (order: any): {lat: number; lng: number} | null => {
  const customer = order?.customer;
  const delivery = order?.delivery ?? {};

  const lat = toNumber(delivery.lat ?? customer?.lat);
  const lng = toNumber(delivery.lng ?? customer?.lng);

  if (lat === null || lng === null) return null;
  return {lat, lng};
};

const DeliveryMapOverlays = ({mapAreas, deliveryOrders, openOrderPopup}: DeliveryMapOverlaysProps) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !globalThis.google?.maps) return;

    const polygons: google.maps.Polygon[] = [];

    for (const area of mapAreas) {
      const normalized = normalizeAreaGeometry(area);
      if (!normalized) continue;

      if (normalized.type === "Polygon") {
        const paths = (normalized.coordinates as GeoPolygonCoordinates)
          .map(toRingPath)
          .filter((path): path is google.maps.LatLngLiteral[] => path !== null);

        if (!paths.length) continue;

        const polygon = new google.maps.Polygon({
          map,
          paths,
          strokeColor: "#3388ff",
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: "#3388ff",
          fillOpacity: 0.2
        });
        polygons.push(polygon);
        continue;
      }

      for (const polygonCoordinates of normalized.coordinates as GeoMultiPolygonCoordinates) {
        const paths = polygonCoordinates
          .map(toRingPath)
          .filter((path): path is google.maps.LatLngLiteral[] => path !== null);
        if (!paths.length) continue;

        const polygon = new google.maps.Polygon({
          map,
          paths,
          strokeColor: "#3388ff",
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: "#3388ff",
          fillOpacity: 0.2
        });
        polygons.push(polygon);
      }
    }

    return () => {
      polygons.forEach((polygon) => polygon.setMap(null));
    };
  }, [map, mapAreas]);

  useEffect(() => {
    if (!map || !globalThis.google?.maps) return;

    const markers: google.maps.Marker[] = [];
    const listeners: google.maps.MapsEventListener[] = [];

    for (const order of deliveryOrders) {
      const coordinates = getOrderCoordinates(order);
      if (!coordinates) continue;

      const isPending = order.status === OrderStatus.Pending;
      const marker = new google.maps.Marker({
        map,
        position: coordinates,
        title: order?.customer?.name ?? "Delivery Order",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: isPending ? "#ef4444" : "#22c55e",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2
        }
      });

      markers.push(marker);
      listeners.push(
        marker.addListener("click", () => {
          openOrderPopup(order);
        })
      );
    }

    return () => {
      listeners.forEach((listener) => listener.remove());
      markers.forEach((marker) => marker.setMap(null));
    };
  }, [map, deliveryOrders, openOrderPopup]);

  return null;
};

export const Delivery = () => {
  const { t } = useTranslation('delivery');
  const db = useDB();
  const {selectedOrder, openOrderPopup, deliveryOrders} = useDeliveryOrders();
  const [mapAreas, setMapAreas] = useState<MapArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [center, setCenter] = useState({lat: 0, lng: 0});

  // Load existing map areas from database
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
      } finally {
        setLoading(false);
      }
    };

    loadMapAreas();
  }, []);

  const selectedOrderCenter = useMemo(() => {
    if (!selectedOrder) return null;
    return getOrderCoordinates(selectedOrder);
  }, [selectedOrder]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh_-_70px_-_25px)]">
        <span className="text-neutral-600 text-lg">{t('map.loading')}</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-5">
      <div className="col-span-4">
        <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
          <Map
            className="h-[calc(100vh_-_70px_-_25px)]"
            defaultCenter={center}
            center={selectedOrderCenter ?? undefined}
            defaultZoom={11}
            gestureHandling="greedy"
            disableDefaultUI
          >
            <DeliveryMapOverlays
              mapAreas={mapAreas}
              deliveryOrders={deliveryOrders}
              openOrderPopup={openOrderPopup}
            />
          </Map>
        </APIProvider>
      </div>
      <div className="col-span-1 select-none">
        <ScrollContainer className="h-[calc(100vh_-_70px_-_25px)]">
          <div className="">
            {deliveryOrders.length > 0 ? (
              deliveryOrders.map((order) => (
                <DeliveryOrderItem
                  key={order.id.toString()}
                  order={order}
                  onClick={() => openOrderPopup(order)}
                />
              ))
            ) : (
              <div className="text-center text-3xl flex flex-col justify-center items-center h-[calc(100vh_-_200px)] gap-5">
                <FontAwesomeIcon icon={faExclamationCircle} size="2x" />
                No delivery orders...
              </div>
            )}
          </div>
        </ScrollContainer>
      </div>
    </div>
  )
}
