// src/features/driver/NextStopCard.js (dueño: P3)
// Próxima parada (rediseño 30 oct): tarjeta blanca con borde del color de la ruta. En orden:
// cliente, dirección y la referencia bien visible (es lo que el motorista usa para encontrar la
// casa). Debajo, la hora de llegada ("Llega 10:42", hecha por routeTimes: la misma que el despacho) y dos botones:
// Navegar (abre la elección Waze / Google Maps) y Llamar al cliente.
// "Llegué al destino" ya no va aquí: es la acción principal y vive abajo, en la barra fija.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { PRIORITY } from '../../constants';
import { colors, radius, spacing, tones, typography } from '../../theme';
import { ErrorBanner } from './ErrorBanner';
import { callCustomer, openGoogleMaps, openWaze } from './navigationLinks';
import { itemCount } from './routeMath';

export function NextStopCard({ shipment, arrives, color = colors.primary }) {
  const { code, customer, address, location, priority } = shipment;
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState(null);
  const run = (promise) => {
    setError(null);
    promise.catch((err) => setError(err.message));
  };
  const express = priority === PRIORITY.EXPRESS;
  const items = itemCount(shipment);
  const meta = [arrives && `Llega ${arrives}`, `${items} ${items === 1 ? 'artículo' : 'artículos'}`].filter(Boolean);

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { borderColor: color }]}>
        <View style={styles.top}>
          <Text style={styles.kicker} numberOfLines={1}>
            Próxima parada <Text style={styles.code}>· {code}</Text>
          </Text>
          {express ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>Express</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.customer} accessibilityRole="header">
          {customer?.name ?? code}
        </Text>
        {address?.text ? <Text style={styles.address}>{address.text}</Text> : null}
        {address?.municipio ? <Text style={styles.municipio}>{address.municipio}</Text> : null}

        {address?.reference ? (
          <View style={styles.reference}>
            <Text style={styles.referenceLabel}>Referencia</Text>
            <Text style={styles.referenceText}>{address.reference}</Text>
          </View>
        ) : null}

        <Text style={styles.meta}>{meta.join(' · ')}</Text>

        <View style={styles.actions}>
          <Button
            title="Navegar"
            icon="navigation"
            variant="secondary"
            size="md"
            accessibilityLabel="Navegar"
            onPress={() => setChoosing(!choosing)}
            style={styles.action}
          />
          {customer?.phone ? (
            <Button
              title="Llamar"
              icon="call"
              variant="secondary"
              size="md"
              accessibilityLabel="Llamar"
              onPress={() => run(callCustomer(customer.phone))}
              style={styles.action}
            />
          ) : null}
        </View>
        {choosing ? (
          <View style={styles.choose}>
            <Button
              title="Waze"
              variant="text"
              size="md"
              onPress={() => run(openWaze(location))}
              style={styles.action}
            />
            <Button
              title="Google Maps"
              variant="text"
              size="md"
              onPress={() => run(openGoogleMaps(location))}
              style={styles.action}
            />
          </View>
        ) : null}
      </View>
      <ErrorBanner message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  card: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kicker: { ...typography.captionStrong, color: colors.onSurfaceVariant, flex: 1 },
  code: { ...typography.caption, color: colors.onSurfaceVariant },
  tag: {
    paddingHorizontal: spacing.sm,
    height: 22,
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: tones.tertiary.bg,
  },
  tagText: { ...typography.captionStrong, color: tones.tertiary.fg },
  customer: { ...typography.headline, color: colors.onSurface, marginTop: spacing.sm },
  address: { ...typography.bodyLarge, color: colors.onSurface, marginTop: spacing.xs },
  municipio: { ...typography.body, color: colors.onSurfaceVariant },
  reference: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainer,
  },
  referenceLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  referenceText: { ...typography.bodyLarge, fontFamily: typography.fonts.medium, color: colors.onSurface },
  meta: { ...typography.number, color: colors.onSurface, marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  action: { flex: 1 },
  choose: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
});

export default NextStopCard;
