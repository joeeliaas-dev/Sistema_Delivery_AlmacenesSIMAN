// src/components/DispatchMap.js (dueño: P3) — Android e iOS
// Mapa del despacho en el teléfono (S4-11) con react-native-maps. Misma interfaz que la web:
//   <DispatchMap pins routes selectedId onPinPress onPinDragEnd style? />
//   pin   = { id, lat, lng, color, label, draggable, title?, size? }
//           size 'sm' (C37): punto de 14 px sin número, misma área táctil; al seleccionarlo crece
//   route = { id, color, coords: [[lat, lng]], dashed? }
// El pin seleccionado se ve más grande y es el único que se puede arrastrar (si draggable).
// Se encuadra solo cuando cambian los pines o las rutas (ids), no en cada render ni al arrastrar.
// En web se usa DispatchMap.web.js (Leaflet).
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { colors, radius, typography } from '../theme';
import { pinLayer, pinOffsets } from './mapPinLayout';

const EDGE = { top: 48, right: 48, bottom: 48, left: 48 };
const FALLBACK = { latitude: 13.699, longitude: -89.22 };
const toLatLng = ([lat, lng]) => ({ latitude: lat, longitude: lng });

export function DispatchMap({ pins = [], routes = [], selectedId, onPinPress, onPinDragEnd, style }) {
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const valid = pins.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const fitKey = `${valid.map((p) => p.id).join('|')}#${routes.map((r) => `${r.id}:${r.coords?.length ?? 0}`).join('|')}`;

  // Los marcadores con vista propia se redibujan al cambiar y luego se congelan (rendimiento en Android)
  const viewKey = `${valid.map((p) => `${p.id}:${p.color}:${p.label}:${p.size ?? ''}`).join('|')}#${selectedId}`;
  const [settledKey, setSettledKey] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => setSettledKey(viewKey), 600);
    return () => clearTimeout(t);
  }, [viewKey]);
  const tracking = settledKey !== viewKey;

  useEffect(() => {
    if (!ready) return;
    const points = [...valid.map((p) => [p.lat, p.lng]), ...routes.flatMap((r) => r.coords ?? [])].map(toLatLng);
    if (points.length) mapRef.current?.fitToCoordinates(points, { edgePadding: EDGE, animated: true });
    // Solo al cambiar fitKey: arrastrar un pin no debe mover el mapa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey]);

  // Pines en el mismo punto: se abren unos píxeles (el ancla se mide en fracción de la caja de 44)
  const offsets = pinOffsets(valid, selectedId);
  const anchorOf = (id) => {
    const [dx, dy] = offsets[id] ?? [0, 0];
    return { x: 0.5 - dx / 44, y: 0.5 - dy / 44 };
  };

  const first = valid[0] ? { latitude: valid[0].lat, longitude: valid[0].lng } : FALLBACK;

  return (
    <View style={[styles.wrap, style]} accessibilityLabel="Mapa del despacho">
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...first, latitudeDelta: 0.12, longitudeDelta: 0.12 }}
        onMapReady={() => setReady(true)}
        toolbarEnabled={false}
        showsPointsOfInterest={false}
      >
        {routes.map((r) =>
          r.coords?.length > 1 ? (
            <Polyline
              key={r.id}
              coordinates={r.coords.map(toLatLng)}
              strokeColor={r.color ?? colors.primary}
              strokeWidth={4}
              lineDashPattern={r.dashed ? [6, 8] : undefined}
            />
          ) : null,
        )}
        {valid.map((pin) => {
          const selected = pin.id === selectedId;
          const small = pin.size === 'sm' && !selected;
          return (
            <Marker
              key={pin.id}
              coordinate={{ latitude: pin.lat, longitude: pin.lng }}
              anchor={anchorOf(pin.id)}
              tracksViewChanges={tracking}
              draggable={selected && !!pin.draggable}
              onPress={() => onPinPress?.(pin.id)}
              onDragEnd={(e) => {
                const { latitude, longitude } = e.nativeEvent.coordinate;
                onPinDragEnd?.(pin.id, { lat: latitude, lng: longitude });
              }}
              title={pin.title}
              zIndex={pinLayer(pin, selected)}
            >
              <View style={styles.hit}>
                <View
                  style={[
                    styles.pin,
                    { backgroundColor: pin.color ?? colors.primary },
                    small && styles.pinSmall,
                    selected && styles.pinSelected,
                    selected && { borderColor: pin.color ?? colors.primary },
                  ]}
                >
                  {small ? null : (
                    <Text style={[styles.pinText, selected && styles.pinTextSelected]} numberOfLines={1}>
                      {pin.label}
                    </Text>
                  )}
                </View>
              </View>
            </Marker>
          );
        })}
      </MapView>
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
  // Área táctil mínima (C17): caja transparente de 44 × 44 con el círculo de 30 px al centro
  hit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pin: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 6,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinSmall: { minWidth: 14, height: 14, paddingHorizontal: 0, borderRadius: 7, borderWidth: 1.5 },
  pinSelected: { minWidth: 40, height: 40, borderRadius: 20, borderWidth: 3 },
  pinText: { fontSize: 11, lineHeight: 14, fontFamily: typography.fonts.bold, color: colors.white },
  pinTextSelected: { fontSize: 13, lineHeight: 16 },
});

export default DispatchMap;
