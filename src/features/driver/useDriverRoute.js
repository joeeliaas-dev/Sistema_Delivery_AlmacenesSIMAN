// src/features/driver/useDriverRoute.js (dueño: P3)
// Única puerta de la Vista motorista y de Entrega a los datos. Las pantallas no cambian cuando cambia la fuente.
import { useEffect, useState } from 'react';
import { listenDrivers, listenZones } from '../catalog/catalogService';
import { listenDriverRoute } from '../routes/routesService';
import { listenRouteShipments } from '../shipments/shipmentsService';
import { useAppStore } from '../../store/useAppStore';

/**
 * Motorista elegido, su ruta de hoy y los envíos de esa ruta, en tiempo real.
 * route es null si el motorista no tiene ruta en la fecha. zone es la del motorista (color del avatar).
 */
export function useDriverRoute() {
  const driverId = useAppStore((s) => s.currentDriverId);
  const date = useAppStore((s) => s.date);

  const [drivers, setDrivers] = useState([]);
  const [zones, setZones] = useState([]);
  // undefined = cargando; se guarda con su llave para no mostrar datos del motorista anterior
  const [routeState, setRouteState] = useState({ key: null, route: undefined });
  const [shipmentsState, setShipmentsState] = useState({ routeId: null, list: [] });

  useEffect(() => listenDrivers(setDrivers), []);
  useEffect(() => listenZones(setZones), []);

  const routeKey = `${driverId}|${date}`;
  useEffect(
    () => listenDriverRoute({ driverId, date }, (route) => setRouteState({ key: routeKey, route })),
    [driverId, date, routeKey],
  );

  const route = routeState.key === routeKey ? routeState.route : undefined;
  const routeId = route?.id ?? null;

  useEffect(() => {
    if (!routeId) return undefined;
    return listenRouteShipments(routeId, (list) => setShipmentsState({ routeId, list }));
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
