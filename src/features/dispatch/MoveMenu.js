// src/features/dispatch/MoveMenu.js  (dueño: P2)
// Menú "Pasar a…" (S4-08): un botón por ruta a la que se puede pasar el pedido elegido, con el
// color de la ruta. El resultado (o el motivo de moveStop si no se puede) se muestra debajo.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { colors, radius, spacing, tones, typography } from '../../theme';

/**
 * @param {{ targets: Array<{ id, code, color, driverName, full?: boolean }>, busyId: string|null,
 *   message: { ok: boolean, text: string }|null, note?: string|null, onMove: (routeId: string) => void }} props
 *   full: la ruta ya lleva el máximo de paradas (va al final, atenuada); note: por qué no se puede mover
 */
export function MoveMenu({ targets, busyId, message, note, onMove }) {
  if (!targets.length && !message && !note) return null;
  return (
    <View style={styles.box}>
      {note ? (
        <View style={styles.note}>
          <Icon name="lock_outline" size={18} color={colors.onSurfaceVariant} />
          <Text style={styles.noteText}>{note}</Text>
        </View>
      ) : null}
      {targets.length ? <Text style={styles.title}>Pasar a…</Text> : null}
      <View style={styles.row}>
        {targets.map((t) => {
          const busy = busyId === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => onMove(t.id)}
              disabled={Boolean(busyId)}
              accessibilityRole="button"
              accessibilityLabel={`Pasar a la ${t.code} de ${t.driverName}${t.full ? ' (llena)' : ''}`}
              style={({ pressed }) => [
                styles.target,
                { borderColor: t.full ? colors.outline : t.color },
                pressed && styles.pressed,
                ((busyId && !busy) || t.full) && styles.dimmed,
              ]}
            >
              <View style={[styles.dot, { backgroundColor: t.color }]} />
              <Text style={styles.targetText} numberOfLines={1}>
                {busy ? 'Moviendo…' : `${t.code} · ${t.driverName}${t.full ? ' · llena (25 paradas)' : ''}`}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {message ? (
        <View
          style={[styles.message, { backgroundColor: message.ok ? tones.success.bg : tones.error.bg }]}
          accessibilityLiveRegion="polite"
        >
          <Icon
            name={message.ok ? 'task_alt' : 'error_outline'}
            size={18}
            color={message.ok ? tones.success.fg : tones.error.fg}
          />
          <Text style={[styles.messageText, { color: message.ok ? tones.success.fg : tones.error.fg }]}>
            {message.text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: spacing.sm, gap: spacing.sm },
  title: { ...typography.label, color: colors.onSurface },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  target: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1.5,
    backgroundColor: colors.white,
    maxWidth: '100%',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  targetText: { ...typography.label, color: colors.onSurface, flexShrink: 1 },
  pressed: { backgroundColor: colors.surfaceLow },
  dimmed: { opacity: 0.5 },
  message: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  messageText: { ...typography.body, flex: 1 },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noteText: { ...typography.body, color: colors.onSurfaceVariant, flex: 1 },
});

export default MoveMenu;
