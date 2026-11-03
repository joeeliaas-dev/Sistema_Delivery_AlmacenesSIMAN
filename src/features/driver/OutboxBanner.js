// src/features/driver/OutboxBanner.js (dueño: P3)
// Aviso "sin señal" arriba de la vista del motorista (bandeja de P1, src/lib/outbox.js):
//   - sin conexión: "Sin señal. Lo que registre se guarda en el teléfono." (o cuántas faltan por enviar);
//   - con conexión y algo guardado: "2 entregas por enviar" y "Enviar ahora" (si no, se envían solas);
//   - lo que falló por otro motivo (p. ej. el despacho cambió el pedido): su error y "Quitar".
// Nada si hay señal y no queda nada por enviar.
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { discardQueued, flushOutbox, useOutbox } from '../../lib/outbox';
import { colors, radius, spacing, tones, typography } from '../../theme';
import { failedItems, outboxNotice } from './outboxMath';

/** true si el teléfono tiene conexión (en web, navigator.onLine y los eventos online / offline). */
export function useOnline() {
  const read = () => (Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.onLine !== false : true);
  const [online, setOnline] = useState(read);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function OutboxBanner() {
  const outbox = useOutbox();
  const online = useOnline();
  const notice = outboxNotice(outbox, online);
  const failed = failedItems(outbox);
  if (!notice && !failed.length) return null;
  const t = notice ? tones[notice.tone] : null;

  return (
    <View style={styles.wrap}>
      {notice ? (
        <View style={[styles.box, { backgroundColor: t.bg }]} accessibilityLiveRegion="polite">
          <Icon name={online ? 'cloud_upload' : 'cloud_off'} size={20} color={t.fg} />
          <Text style={[styles.text, { color: t.fg }]}>{notice.text}</Text>
          {notice.canSend ? (
            <Button title="Enviar ahora" variant="text" size="sm" onPress={() => flushOutbox()} />
          ) : null}
        </View>
      ) : null}
      {failed.map((x) => (
        <View key={x.id} style={[styles.box, { backgroundColor: tones.error.bg }]}>
          <Icon name="error_outline" size={20} color={tones.error.fg} />
          <Text style={[styles.text, { color: tones.error.fg }]}>
            {x.code} no se pudo enviar: {x.error}
          </Text>
          <Button
            title="Quitar"
            variant="text"
            size="sm"
            onPress={() => discardQueued(x.id)}
            accessibilityLabel={`Quitar ${x.code} de lo guardado`}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  text: { ...typography.bodyStrong, flex: 1, color: colors.onSurface },
});

export default OutboxBanner;
