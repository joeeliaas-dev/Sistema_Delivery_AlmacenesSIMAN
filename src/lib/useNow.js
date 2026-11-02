// src/lib/useNow.js  (dueño: P1)
// La hora actual, que se renueva cada minuto: así las horas en vivo de routeTimes avanzan solas
// aunque la pantalla quede abierta y no cambien los datos.
import { useEffect, useState } from 'react';

export function useNow(everyMs = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
