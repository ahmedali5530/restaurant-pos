import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order, ORDER_FETCHES, OrderStatus} from "@/api/model/order.ts";
import {formatNumber, safeNumber, toRecordId, withCurrency} from "@/lib/utils.ts";
import {toLuxonDateTime} from "@/lib/datetime.ts";
import {APIProvider, Map as GoogleMap, useMap} from "@vis.gl/react-google-maps";
import {MarkerClusterer, type Cluster, type ClusterStats, type Renderer} from "@googlemaps/markerclusterer";
import {calculateOrderItemPrice} from "@/lib/cart.ts";

interface ReportFilters {
  startDate?: string | null;
  endDate?: string | null;
  couponIds: string[];
  paymentTypeIds: string[];
  menuItemIds: string[];
  areaNames: string[];
  refund?: boolean;
  merged?: boolean;
  cancelled?: boolean;
  split?: boolean;
  paid?: boolean;
  pending?: boolean;
  inProgress?: boolean;
  showMenuItems?: boolean;
  showDetails?: boolean;
  sortBy?: string;
  sortDirection: "Ascending" | "Descending";
}

const getAddressArea = (address?: string | null): string => {
  if (!address) return "Unknown";
  const parts = address
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }

  return parts[0] || "Unknown";
};

const parseFilters = (): ReportFilters => {
  const params = new URLSearchParams(window.location.search);
  const parseMulti = (name: string) => {
    const list = [
      ...params.getAll(`${name}[]`),
      ...params.getAll(name),
    ].filter(Boolean);
    return list as string[];
  };

  return {
    startDate: params.get("start") || params.get("start"),
    endDate: params.get("end") || params.get("end"),
    couponIds: parseMulti("coupons"),
    paymentTypeIds: parseMulti("payment_types"),
    menuItemIds: parseMulti("menu_items"),
    areaNames: parseMulti("areas"),
    refund: params.has("refund"),
    merged: params.has("merged"),
    cancelled: params.has("cancelled"),
    split: params.has("split"),
    paid: params.has("paid"),
    pending: params.has("pending"),
    inProgress: params.has("in_progress"),
    showMenuItems: params.has("show_menu_items"),
    showDetails: params.has("show_details"),
    sortBy: params.get("sortBy") ?? "Date",
    sortDirection: params.get("sortDirection") === "Ascending" ? "Ascending" : "Descending",
  };
};

const getOrderCoordinates = (order: Order): {lat: number; lng: number} | null => {
  const lat = Number(order?.delivery?.lat ?? order?.customer?.lat);
  const lng = Number(order?.delivery?.lng ?? order?.customer?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {lat, lng};
};

const getClusterColor = (count: number): string => {
  if (count >= 16) return "#F43A30";
  if (count >= 6) return "#FFA514";
  return "#0046FE";
};

const clusterRenderer: Renderer = {
  render({count, position}: Cluster, _stats: ClusterStats) {
    const color = getClusterColor(count);
    const size = Math.min(50, 36 + Math.floor(count / 2));
    const svg = btoa(`
<svg fill="${color}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <circle cx="120" cy="120" opacity=".6" r="70" />
  <circle cx="120" cy="120" opacity=".3" r="90" />
  <circle cx="120" cy="120" opacity=".2" r="110" />
</svg>`);

    return new google.maps.Marker({
      position,
      icon: {
        url: `data:image/svg+xml;base64,${svg}`,
        scaledSize: new google.maps.Size(size, size),
      },
      label: {
        text: String(count),
        color: "#ffffff",
        fontSize: "12px",
        fontWeight: "bold",
      },
      zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count,
    });
  },
};

const DeliveryDensityClusterOverlay = ({orders}: {orders: Order[]}) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !globalThis.google?.maps) return;

    const markers: google.maps.Marker[] = [];
    for (const order of orders) {
      const coordinates = getOrderCoordinates(order);
      if (!coordinates) continue;

      markers.push(new google.maps.Marker({
        position: coordinates,
        title: getAddressArea(order?.delivery?.address),
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#F43A30",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      }));
    }

    const clusterer = new MarkerClusterer({
      map,
      markers,
      renderer: clusterRenderer,
    });

    if (markers.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      for (const marker of markers) {
        const position = marker.getPosition();
        if (position) bounds.extend(position);
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 40);
      }
    }

    return () => {
      clusterer.clearMarkers();
      markers.forEach(marker => marker.setMap(null));
    };
  }, [map, orders]);

  return null;
};

export const DeliveryDensityReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState({lat: 0, lng: 0});

  const filters = useMemo(parseFilters, []);
  const subtitle = filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : undefined;

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const loadMapCenter = async () => {
      const [r] = await db.query(`SELECT * FROM ${Tables.settings} WHERE key = 'map_center' LIMIT 1`);
      if (r.length > 0 && r[0].values) {
        setMapCenter({
          lat: Number(r[0].values.lat) || 0,
          lng: Number(r[0].values.lng) || 0,
        });
      }
    };

    loadMapCenter();
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const conditions: string[] = ["delivery != NONE"];
        const params: Record<string, any> = {};

        if (filters.startDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          params.startDate = filters.startDate;
        }
        if (filters.endDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          params.endDate = filters.endDate;
        }

        const statusConditions: string[] = [];
        if (filters.refund) statusConditions.push(`status = '${OrderStatus.Refunded}'`);
        if (filters.merged) statusConditions.push(`status = '${OrderStatus.Merged}'`);
        if (filters.cancelled) statusConditions.push(`status = '${OrderStatus.Cancelled}'`);
        if (filters.split) statusConditions.push(`status = '${OrderStatus.Spilt}'`);
        if (filters.paid) statusConditions.push(`status = '${OrderStatus.Paid}'`);
        if (filters.pending) statusConditions.push(`status = '${OrderStatus.Pending}'`);
        if (filters.inProgress) statusConditions.push(`status = '${OrderStatus["In Progress"]}'`);
        if (statusConditions.length > 0) {
          conditions.push(`(${statusConditions.join(" OR ")})`);
        }

        if (filters.paymentTypeIds.length > 0) {
          const paymentFilter: string[] = [];
          filters.paymentTypeIds.forEach((pt, index) => {
            paymentFilter.push(`array::any(payments.payment_type.id, $payment${index})`);
            params[`payment${index}`] = toRecordId(pt);
          });
          conditions.push(`(${paymentFilter.join(" OR ")})`);
        }

        const ordersQuery = `
          SELECT *
          FROM ${Tables.orders}
          ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
          FETCH ${ORDER_FETCHES.join(", ")}
        `;
        const ordersResult: any = await queryRef.current(ordersQuery, params);
        setOrders((ordersResult?.[0] ?? []) as Order[]);
      } catch (err) {
        console.error("Failed to load delivery density report", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters]);

  const filteredOrders = useMemo(() => {
    let next = [...orders];

    if (filters.couponIds.length > 0) {
      const couponSet = new Set(filters.couponIds);
      next = next.filter(order => {
        const couponId = order?.coupon?.coupon?.id?.toString?.() ?? order?.coupon?.coupon?.toString?.();
        return Boolean(couponId && couponSet.has(couponId));
      });
    }

    if (filters.menuItemIds.length > 0) {
      const itemSet = new Set(filters.menuItemIds);
      next = next.filter(order =>
        (order.items ?? []).some(item => {
          const id = item.item?.id?.toString?.() ?? item.item?.toString?.();
          return Boolean(id && itemSet.has(id));
        })
      );
    }

    if (filters.areaNames.length > 0) {
      const areaSet = new Set(filters.areaNames.map(item => item.toLowerCase()));
      next = next.filter(order => areaSet.has(getAddressArea(order?.delivery?.address).toLowerCase()));
    }

    const sortDirection = filters.sortDirection === "Ascending" ? 1 : -1;
    next.sort((a, b) => {
      if (filters.sortBy === "Invoice") return (safeNumber(a.invoice_number) - safeNumber(b.invoice_number)) * sortDirection;
      if (filters.sortBy === "Status") return String(a.status).localeCompare(String(b.status)) * sortDirection;
      if (filters.sortBy === "Total") {
        const aTotal = safeNumber((a.payments ?? []).reduce((sum, p) => sum + safeNumber(p.payable), 0));
        const bTotal = safeNumber((b.payments ?? []).reduce((sum, p) => sum + safeNumber(p.payable), 0));
        return (aTotal - bTotal) * sortDirection;
      }
      if (filters.sortBy === "Area") return getAddressArea(a?.delivery?.address).localeCompare(getAddressArea(b?.delivery?.address)) * sortDirection;
      return (toLuxonDateTime(a.created_at).toMillis() - toLuxonDateTime(b.created_at).toMillis()) * sortDirection;
    });

    return next;
  }, [orders, filters]);

  const locationCount = useMemo(() => {
    const locations = new Set<string>();
    for (const order of filteredOrders) {
      const coordinates = getOrderCoordinates(order);
      if (!coordinates) continue;
      locations.add(`${coordinates.lat.toFixed(6)}:${coordinates.lng.toFixed(6)}`);
    }
    return locations.size;
  }, [filteredOrders]);

  if (loading) {
    return (
      <ReportsLayout title={t('titles.deliveryDensity')} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">{t('loading.deliveryDensity')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('titles.deliveryDensity')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout title={t('titles.deliveryDensity')} subtitle={subtitle}>
      <div className="space-y-8">
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <div className="bg-neutral-100 px-6 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-700">Order Density Map</h3>
            <span className="text-xs text-neutral-600">
              {formatNumber(filteredOrders.length)} orders • {formatNumber(locationCount)} locations
            </span>
          </div>
          <div className="h-[420px] w-full">
            <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
              <GoogleMap
                className="h-full w-full"
                defaultCenter={mapCenter}
                defaultZoom={11}
                gestureHandling="greedy"
                disableDefaultUI
              >
                <DeliveryDensityClusterOverlay orders={filteredOrders} />
              </GoogleMap>
            </APIProvider>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <div className="bg-neutral-100 px-6 py-3">
            <h3 className="text-sm font-semibold text-neutral-700">{t('categories.orders')}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 table-hover">
              <thead className="bg-neutral-50">
              <tr>
                <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t('columns.date')}</th>
                <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('columns.invoice')}</th>
                <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('filters.status')}</th>
                <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">Area</th>
                <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">Address</th>
                {filters.showMenuItems && (
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('filters.menuItems')}</th>
                )}
                {filters.showDetails && (
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('metrics.lineTotal')}</th>
                )}
                <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">Paid Amount</th>
              </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
              {filteredOrders.map(order => {
                const orderDate = toLuxonDateTime(order.created_at);
                const lineTotal = safeNumber((order.items ?? []).reduce((sum, item) => sum + calculateOrderItemPrice(item), 0));
                const paidAmount = safeNumber((order.payments ?? []).reduce((sum, p) => sum + safeNumber(p.payable), 0));
                return (
                  <tr key={String(order.id)}>
                    <td className="py-3 pl-6 pr-3 text-sm text-neutral-700">
                      <div>{orderDate.toFormat(import.meta.env.VITE_DATE_FORMAT)}</div>
                      <div className="text-neutral-500">{orderDate.toFormat(import.meta.env.VITE_TIME_FORMAT)}</div>
                    </td>
                    <td className="py-3 px-3 text-sm text-neutral-700">{order.invoice_number}</td>
                    <td className="py-3 px-3 text-sm text-neutral-700">{order.status}</td>
                    <td className="py-3 px-3 text-sm text-neutral-700">{getAddressArea(order?.delivery?.address)}</td>
                    <td className="py-3 px-3 text-sm text-neutral-700">{order?.delivery?.address || "-"}</td>
                    {filters.showMenuItems && (
                      <td className="py-3 px-3 text-sm text-neutral-700">
                        {(order.items ?? []).map(item => item.item?.name).filter(Boolean).join(", ") || "-"}
                      </td>
                    )}
                    {filters.showDetails && (
                      <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(lineTotal)}</td>
                    )}
                    <td className="py-3 pr-6 text-right text-sm font-semibold text-neutral-900">{withCurrency(paidAmount)}</td>
                  </tr>
                );
              })}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={filters.showMenuItems ? (filters.showDetails ? 8 : 7) : (filters.showDetails ? 7 : 6)} className="py-6 text-center text-sm text-neutral-500">
                    No delivery orders found for the selected filters.
                  </td>
                </tr>
              )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ReportsLayout>
  );
};
