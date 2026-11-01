// src/features/driver/navigationLinks.js (dueño: P3)
// Enlaces del plan (sección APIs de mapas). No se construye navegación propia.
// Si el teléfono no puede abrirlos, la promesa falla con un mensaje listo para mostrar.
import { Linking } from 'react-native';

export const wazeUrl = ({ lat, lng }) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;

export const googleMapsUrl = ({ lat, lng }) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

const open = (url, app) =>
  Linking.openURL(url).catch(() => {
    throw new Error(`No se pudo abrir ${app}`);
  });

export const openWaze = (location) => open(wazeUrl(location), 'Waze');
export const openGoogleMaps = (location) => open(googleMapsUrl(location), 'Google Maps');
