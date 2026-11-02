// src/components/RouteMap.js  (dueño: P2, compartido)
// Mapa de rutas del prototipo con react-native-maps: depósito, paradas express o normal
// con su etiqueta y, si showPath, la línea de la ruta en el orden recibido.
// <RouteMap depot stops showPath onStopPress selectedId? height? />
// Cada parada: { id, location{lat,lng}, label, priority, status, title?, subtitle? }
// (title y subtitle opcionales: cliente y detalle; en el teléfono salen al tocar el pin).
// En web se usa RouteMap.web.js (react-native-maps no funciona en web).
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { MapLegend, StopPin } from './RouteMapParts';

const EDGE = { top: 64, right: 48, bottom: 48, left: 48 };
const toLatLng = ({ lat, lng }) => ({ latitude: lat, longitude: lng });

export function RouteMap({ depot, stops = [], showPath = false, onStopPress, selectedId, height = 300 }) {
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const coords = [...(depot?.location ? [depot.location] : []), ...stops.map((s) => s.location)].map(toLatLng);
  const coordsKey = coords.map((c) => `${c.latitude},${c.longitude}`).join('|');
  const stopsKey = `${stops.map((s) => `${s.id}:${s.status}:${s.label}`).join('|')}|${selectedId}`;

  // Los marcadores con vista propia se redibujan cuando cambian y luego se congelan
  // (rendimiento en Android): se sigue la vista hasta que el último cambio se asienta.
  const [settledKey, setSettledKey] = useState(null);
  const tracking = settledKey !== stopsKey;
  useEffect(() => {
    const t = setTimeout(() => setSettledKey(stopsKey), 600);
    return () => clearTimeout(t);
  }, [stopsKey]);

  // Solo reencuadra cuando cambian los puntos, no en cada render
  useEffect(() => {
    if (ready && coords.length) mapRef.current?.fitToCoordinates(coords, { edgePadding: EDGE, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, coordsKey]);

  const center = coords[0] ?? { latitude: 13.699, longitude: -89.22 };

  return (
    <View style={styles.outer}>
      <View style={[styles.wrap, { height }]}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{ ...center, latitudeDelta: 0.12, longitudeDelta: 0.12 }}
          onMapReady={() => setReady(true)}
          toolbarEnabled={false}
          showsPointsOfInterest={false}
        >
          {showPath && coords.length > 1 ? (
            <>
              <Polyline coordinates={coords} strokeColor="rgba(107, 90, 166, 0.18)" strokeWidth={14} />
              <Polyline coordinates={coords} strokeColor={colors.primary} strokeWidth={4} />
            </>
          ) : null}

          {depot?.location ? (
            <Marker
              coordinate={toLatLng(depot.location)}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={tracking}
              title={depot.name}
            >
              <View style={styles.depot}>
                <Text style={styles.depotText}>S</Text>
              </View>
            </Marker>
          ) : null}

          {stops.map((stop) => {
            const selected = stop.id === selectedId;
            return (
              <Marker
                key={stop.id}
                coordinate={toLatLng(stop.location)}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={tracking}
                onPress={() => onStopPress?.(stop.id)}
                title={stop.title}
                description={stop.subtitle}
                zIndex={selected ? 10 : 1}
              >
                {/* Mismo pin que la lista web y el seguimiento: color del estado (V5) y rayo si es express */}
                <View style={[styles.pinWrap, selected && styles.pinSelected]}>
                  <StopPin label={stop.label} priority={stop.priority} status={stop.status} size={30} />
                </View>
              </Marker>
            );
          })}
        </MapView>
      </View>
      {/* La leyenda va debajo del mapa: encima taparía los pines de arriba */}
      <MapLegend />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.mapLand },
  depot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  depotText: { ...typography.captionStrong, fontFamily: fonts.bold, color: colors.white },
  // Margen para que el rayo de express no se recorte en el marcador
  pinWrap: { padding: 6 },
  pinSelected: { transform: [{ scale: 1.2 }] },
  outer: { gap: spacing.sm },
});

export default RouteMap;
