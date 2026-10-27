import { useEffect, useState } from 'react';
import { listenDrivers, listenZones } from '../catalog/catalogService';
import { listenDriverRoute } from '../routes/routesService';
import { listenRouteShipments } from '../shipments/shipmentsService';
import { useAppStore } from '../../store/useAppStore';
export function useDriverRoute() {
  const driverId = useAppStore((s) => s.currentDriverId);
  const date = useAppStore((s) => s.date);
  const [drivers, setDrivers] = useState([]);
  const [zones, setZones] = useState([]);
  const [routeState, setRouteState] = useState({
    key: null,
    route: undefined,
  });
  const [shipmentsState, setShipmentsState] = useState({
    routeId: null,
    list: [],
  });
  useEffect(() => listenDrivers(setDrivers), []);
  useEffect(() => listenZones(setZones), []);
  const routeKey = `${driverId}|${date}`;
  useEffect(
    () =>
      listenDriverRoute(
        {
          driverId,
          date,
        },
        (route) =>
          setRouteState({
            key: routeKey,
            route,
          }),
      ),
    [driverId, date, routeKey],
  );
  const route = routeState.key === routeKey ? routeState.route : undefined;
  const routeId = route?.id ?? null;
  useEffect(() => {
    if (!routeId) return undefined;
    return listenRouteShipments(routeId, (list) =>
      setShipmentsState({
        routeId,
        list,
      }),
    );
  }, [routeId]);
  const shipmentsReady = !routeId || shipmentsState.routeId === routeId;
  const driver = drivers.find((d) => d.id === driverId) ?? null;
  return {
    drivers,
    driverId,
    driver,
    zone: zones.find((z) => z.id === driver?.zoneId) ?? null,
    route: route ?? null,
    shipments: routeId && shipmentsReady ? shipmentsState.list : [],
    loading: route === undefined || !shipmentsReady,
  };
}
