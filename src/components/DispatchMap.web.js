// src/components/DispatchMap.web.js (dueño: P3)
// Mapa del despacho en la web (S4-11) con Leaflet. Misma interfaz que DispatchMap.js (teléfono):
//   <DispatchMap pins routes selectedId onPinPress onPinDragEnd style? />
//   pin   = { id, lat, lng, color, label, draggable, title?, size? }
//           size 'sm' (C37): punto de 14 px sin número, misma área táctil; al seleccionarlo crece
//   route = { id, color, coords: [[lat, lng]], dashed? }  dashed: línea recta entre paradas (sin geometry)
// - Pines con divIcon (el ícono por defecto de Leaflet pierde su imagen en Expo web).
// - El pin seleccionado se ve más grande y es el único que se puede arrastrar (si draggable).
// - Se encuadra solo cuando cambian los pines o las rutas (ids), no en cada render ni al arrastrar.
// - Mosaicos: Geoapify solo con la API real encendida (N38); si no, OpenStreetMap (solo desarrollo).
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import { StyleSheet, View } from 'react-native';
import { GEOAPIFY_LIVE } from '../lib/geoapify';
import { colors, radius } from '../theme';
import { pinLayer, pinOffsets } from './mapPinLayout';

const KEY = process.env.EXPO_PUBLIC_GEOAPIFY_KEY ?? '';
const TILES =
  GEOAPIFY_LIVE && KEY
    ? {
        url: `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${KEY}`,
        attribution:
          'Powered by <a href="https://www.geoapify.com/">Geoapify</a> · © <a href="https://openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }
    : {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      };

// Botones + y − de Leaflet a 44 px (C17); solo dentro de este mapa (clase trazza-map)
const ZOOM_CSS = '.trazza-map .leaflet-bar a{width:44px;height:44px;line-height:44px;font-size:22px}';
if (typeof document !== 'undefined' && !document.getElementById('trazza-map-css')) {
  const el = document.createElement('style');
  el.id = 'trazza-map-css';
  el.textContent = ZOOM_CSS;
  document.head.appendChild(el);
}

// Centro de San Salvador, por si no hay pines
const FALLBACK_CENTER = [13.699, -89.22];
const PIN = 30;
const PIN_SELECTED = 40;
const PIN_SM = 14;
// Área táctil mínima (C17): el círculo se ve de 30 px, pero el marcador mide 44 × 44
const HIT = 44;

const escapeHtml = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

function pinIcon(pin, selected, [dx, dy] = [0, 0]) {
  const small = pin.size === 'sm' && !selected;
  const size = selected ? PIN_SELECTED : small ? PIN_SM : PIN;
  const ring = selected
    ? `0 0 0 3px ${colors.white}, 0 0 0 6px ${pin.color ?? colors.primary}`
    : `0 0 0 ${small ? 1.5 : 2}px ${colors.white}`;
  const box = Math.max(size, HIT);
  const html = `<div style="width:${box}px;height:${box}px;display:flex;align-items:center;justify-content:center;cursor:${selected && pin.draggable ? 'grab' : 'pointer'};"><div style="
    width:${size}px;height:${size}px;border-radius:50%;flex:none;
    background:${pin.color ?? colors.primary};color:${colors.white};
    box-shadow:${ring}, 0 2px 6px rgba(36,21,79,.35);
    display:flex;align-items:center;justify-content:center;
    font:700 ${selected ? 13 : 11}px/1 Roboto_700Bold, Roboto, system-ui, sans-serif;
    cursor:${selected && pin.draggable ? 'grab' : 'pointer'};
  ">${small ? '' : escapeHtml(pin.label)}</div></div>`;
  return L.divIcon({ html, className: '', iconSize: [box, box], iconAnchor: [box / 2 - dx, box / 2 - dy] });
}

// Encuadre automático: solo cuando cambia el conjunto de pines o de rutas
function FitBounds({ pins, routes, fitKey }) {
  const map = useMap();
  useEffect(() => {
    const points = [...pins.map((p) => [p.lat, p.lng]), ...routes.flatMap((r) => r.coords ?? [])].filter(
      ([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng),
    );
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(points, { padding: [32, 32], maxZoom: 16 });
    // Solo al cambiar fitKey: arrastrar un pin no debe mover el mapa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);
  return null;
}

function PinMarker({ pin, selected, offset, onPinPress, onPinDragEnd }) {
  const { color, label, draggable: canDrag, size } = pin;
  const [dx, dy] = offset ?? [0, 0];
  const icon = useMemo(
    () => pinIcon({ color, label, draggable: canDrag, size }, selected, [dx, dy]),
    [color, label, canDrag, size, selected, dx, dy],
  );
  const draggable = selected && !!pin.draggable;
  const handlers = useMemo(
    () => ({
      click: () => onPinPress?.(pin.id),
      dragend: (e) => {
        const { lat, lng } = e.target.getLatLng();
        onPinDragEnd?.(pin.id, { lat, lng });
      },
    }),
    [pin.id, onPinPress, onPinDragEnd],
  );
  return (
    <Marker
      position={[pin.lat, pin.lng]}
      icon={icon}
      draggable={draggable}
      eventHandlers={handlers}
      zIndexOffset={(pinLayer(pin, selected) - 1) * 1000}
      title={pin.title ?? pin.label}
      alt={pin.title ?? pin.label}
      keyboard
    />
  );
}

export function DispatchMap({ pins = [], routes = [], selectedId, onPinPress, onPinDragEnd, style }) {
  const valid = pins.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const fitKey = `${valid.map((p) => p.id).join('|')}#${routes.map((r) => `${r.id}:${r.coords?.length ?? 0}`).join('|')}`;
  const center = valid.length ? [valid[0].lat, valid[0].lng] : FALLBACK_CENTER;
  const offsets = pinOffsets(valid, selectedId);

  return (
    <View style={[styles.wrap, style]} accessibilityLabel="Mapa del despacho">
      <MapContainer
        center={center}
        zoom={12}
        className="trazza-map"
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer url={TILES.url} attribution={TILES.attribution} maxZoom={19} />
        {routes.map((r) =>
          r.coords?.length > 1 ? (
            <Polyline
              key={`halo-${r.id}`}
              positions={r.coords}
              pathOptions={{ color: colors.white, weight: 8, opacity: 0.85 }}
            />
          ) : null,
        )}
        {routes.map((r) =>
          r.coords?.length > 1 ? (
            <Polyline
              key={r.id}
              positions={r.coords}
              pathOptions={{
                color: r.color ?? colors.primary,
                weight: 4,
                opacity: 0.95,
                dashArray: r.dashed ? '6 8' : null,
              }}
            />
          ) : null,
        )}
        {valid.map((pin) => (
          <PinMarker
            key={pin.id}
            pin={pin}
            selected={pin.id === selectedId}
            offset={offsets[pin.id]}
            onPinPress={onPinPress}
            onPinDragEnd={onPinDragEnd}
          />
        ))}
        <FitBounds pins={valid} routes={routes} fitKey={fitKey} />
      </MapContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 320,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
    backgroundColor: colors.mapLand,
  },
});

export default DispatchMap;
