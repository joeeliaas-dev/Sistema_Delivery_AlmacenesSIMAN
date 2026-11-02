// src/features/driver/NotDeliverable.js (dueño: P3)
// Se muestra en Confirmar entrega y No entregado cuando el envío no existe o ya no está en_ruta.
import { Button } from '../../components/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { STATUS } from '../../constants';
import { EmptyState } from './EmptyState';

const REASONS = {
  [STATUS.ENTREGADO]: { title: 'Envío ya entregado', body: 'Este envío ya se cerró como entregado.' },
  [STATUS.NO_ENTREGADO]: { title: 'Ya se registró la no entrega', body: 'El reintento irá en una próxima ruta.' },
  [STATUS.DEVUELTO]: { title: 'Envío devuelto', body: 'Este envío vuelve a bodega.' },
  [STATUS.ASIGNADO]: { title: 'Ruta sin iniciar', body: 'Inicie la ruta en la Vista motorista para poder entregar.' },
  [STATUS.PENDIENTE]: { title: 'Envío sin ruta', body: 'Este envío todavía no está en ninguna ruta.' },
};

export function NotDeliverable({ shipment, id, onGoToDriver }) {
  const info = shipment
    ? (REASONS[shipment.status] ?? { title: 'No se puede entregar', body: 'Este envío ya no está en ruta.' })
    : { title: 'Envío no encontrado', body: `No existe el envío ${id}.` };
  return (
    <EmptyState icon={shipment ? 'info' : 'search_off'} title={info.title} body={info.body}>
      {shipment ? <StatusBadge status={shipment.status} /> : null}
      <Button title="Ir a Vista motorista" icon="two_wheeler" variant="outlined" onPress={onGoToDriver} />
    </EmptyState>
  );
}

export default NotDeliverable;
