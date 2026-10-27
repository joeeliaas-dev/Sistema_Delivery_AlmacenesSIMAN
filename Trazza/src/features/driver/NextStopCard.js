import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { PRIORITY } from '../../constants';
import { formatEta } from '../../lib/eta';
import { colors, radius, spacing, typography } from '../../theme';
import { ErrorBanner } from './ErrorBanner';
import { openGoogleMaps, openWaze } from './navigationLinks';
import { itemCount } from './routeMath';
function Chip({ icon, label }) {
  return (
    <View style={styles.chip}>
      <Icon name={icon} size={16} color={colors.onPrimary} />
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}
export function NextStopCard({ shipment, eta, onArrived }) {
  const { code, customer, address, location, priority } = shipment;
  const [navError, setNavError] = useState(null);
  const navigate = (open) => {
    setNavError(null);
    open(location).catch((err) => setNavError(err.message));
  };
  const express = priority === PRIORITY.EXPRESS;
  return (
    <View style={styles.wrap}>
      <Card variant="primary">
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Icon name="near_me" size={14} color={colors.onPrimary} />
          </View>
          <Text style={styles.headerText}>Próxima parada · </Text>
          <Text style={[styles.headerText, styles.mono]}>{code}</Text>
        </View>

        <Text style={styles.customer}>{customer?.name ?? code}</Text>
        {address?.text ? (
          <Text style={styles.address}>
            {address.text}
            {address.municipio ? `\n${address.municipio}` : ''}
          </Text>
        ) : null}
        {address?.reference ? (
          <View style={styles.referenceRow}>
            <Icon name="place" size={14} color={colors.onPrimary} />
            <Text style={styles.reference}>{address.reference}</Text>
          </View>
        ) : null}

        <View style={styles.chips}>
          {}
          <Chip icon="schedule" label={formatEta(eta ?? 0).replace(/^~/, '')} />
          <Chip icon={express ? 'bolt' : 'local_shipping'} label={express ? 'Express' : 'Normal'} />
          <Chip icon="inventory_2" label={String(itemCount(shipment))} />
        </View>

        {}
        <View style={styles.navRow}>
          <Button
            title="Waze"
            icon="navigation"
            variant="outlinedOnPrimary"
            size="md"
            onPress={() => navigate(openWaze)}
            style={styles.navBtn}
          />
          <Button
            title="Google Maps"
            icon="map"
            variant="outlinedOnPrimary"
            size="md"
            onPress={() => navigate(openGoogleMaps)}
            style={styles.navBtn}
          />
        </View>
        <Button
          title="Llegué al destino"
          icon="task_alt"
          variant="surface"
          onPress={onArrived}
          style={styles.arrived}
        />
      </Card>
      <ErrorBanner message={navError} />
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.onPrimaryChip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    ...typography.captionStrong,
    color: colors.onPrimary,
    marginLeft: -spacing.xs,
  },
  mono: {
    fontFamily: typography.mono,
    marginLeft: -spacing.sm,
  },
  customer: {
    ...typography.headline,
    fontFamily: typography.fonts.medium,
    color: colors.onPrimary,
    marginTop: spacing.md,
  },
  address: {
    ...typography.body,
    lineHeight: 22,
    color: colors.onPrimary,
    opacity: 0.9,
    marginTop: spacing.xs,
  },
  referenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    opacity: 0.9,
  },
  reference: {
    ...typography.caption,
    color: colors.onPrimary,
    flexShrink: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  chip: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.onPrimaryChip,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chipLabel: {
    ...typography.captionStrong,
    color: colors.onPrimary,
  },
  navRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  navBtn: {
    flex: 1,
    paddingHorizontal: spacing.xs,
  },
  arrived: {
    marginTop: spacing.md,
  },
});
export default NextStopCard;
