// src/lib/routeDay.js  (dueño: P1)
// Cuándo una ruta abierta bloquea su zona en una fecha (C45). La ruta de ESE día siempre la ocupa.
// Una de un día anterior que sigue en la calle solo la ocupa si la fecha es hoy (o pasada): el
// motorista todavía no vuelve. Para un día futuro no bloquea: para entonces ya habrá terminado.
import { todayISO } from './dates';

export const blocksZoneOn = (route, date, today = todayISO()) =>
  route?.date === date || (route?.date < date && date <= today);
