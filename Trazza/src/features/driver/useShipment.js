import { useEffect, useState } from 'react';
import { getShipment } from '../shipments/shipmentsService';
export function useShipment(id) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState({
    key: null,
    shipment: undefined,
    error: null,
  });
  const key = `${id}|${attempt}`;
  useEffect(() => {
    let active = true;
    getShipment(id)
      .then(
        (shipment) =>
          active &&
          setLoaded({
            key,
            shipment,
            error: null,
          }),
      )
      .catch(
        (err) =>
          active &&
          setLoaded({
            key,
            shipment: undefined,
            error: err?.message || 'No se pudo leer el envío. Revise la conexión e intente de nuevo.',
          }),
      );
    return () => {
      active = false;
    };
  }, [id, key]);
  const current =
    loaded.key === key
      ? loaded
      : {
          shipment: undefined,
          error: null,
        };
  return {
    shipment: current.shipment,
    error: current.error,
    retry: () => setAttempt((n) => n + 1),
  };
}
