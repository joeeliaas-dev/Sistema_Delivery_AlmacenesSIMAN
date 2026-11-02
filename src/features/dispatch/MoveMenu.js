// src/features/dispatch/MoveMenu.js  (dueño: P2)
// Menú "Pasar a…" (S4-08), rediseño 30 oct: una fila por ruta, con el punto de su color, la ruta y
// el motorista a la izquierda y la distancia ("a 1.2 km") a la derecha. Las que ya llevan el máximo de
// paradas (25) van al final en gris y no se pueden tocar. El resultado de moveStop va debajo.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { colors, radius, spacing, tones, typography } from '../../theme';

/**
 * @param {{ targets: Array<{ id, code, color, driverName, lacks?: boolean, note?: string }>, busyId: string|null,
 *   message: { ok: boolean, text: string }|null, note?: string|null, onMove: (routeId: string) => void }} props
 *   lacks: no se puede elegir (va llena): va al final, atenuado y desactivado
 *   targets[].note: "a 1.2 km" o "llena: 25 paradas"; note: por qué no se puede mover
 */
const targetNote = (t) => t.note ?? (t.lacks ? 'llena' : '');

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
      {targets.length ? (
        <View style={styles.list}>
          {targets.map((t, i) => {
            const busy = busyId === t.id;
            const off = Boolean(busyId) || t.lacks;
            return (
              <Pressable
                key={t.id}
                onPress={() => onMove(t.id)}
                disabled={off}
                accessibilityRole="button"
                accessibilityLabel={`Pasar a la ${t.code} de ${t.driverName}${targetNote(t) ? ` (${targetNote(t)})` : ''}`}
                accessibilityState={{ disabled: off }}
                style={({ pressed }) => [styles.target, i > 0 && styles.divider, pressed && styles.pressed]}
              >
                <View style={[styles.dot, { backgroundColor: t.lacks ? colors.outline : t.color }]} />
                <Text style={[styles.targetText, t.lacks && styles.off]} numberOfLines={1}>
                  {busy ? 'Moviendo…' : `${t.code} · ${t.driverName}`}
                </Text>
                {targetNote(t) ? (
                  <Text style={[styles.targetNote, t.lacks && styles.off]} numberOfLines={1}>
                    {targetNote(t)}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {message ? (
        <View
          style={[styles.message, { backgroundColor: message.ok ? tones.success.bg : tones.error.bg }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.messageText, { color: message.ok ? tones.success.fg : tones.error.fg }]}>
            {message.text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  title: { ...typography.title, color: colors.onSurface },
  list: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  target: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  dot: { width: 10, height: 10, borderRadius: 5 },
  targetText: { ...typography.label, color: colors.onSurface, flex: 1, minWidth: 0 },
  targetNote: { ...typography.caption, color: colors.onSurfaceVariant, flexShrink: 0 },
  off: { color: colors.disabledContent },
  pressed: { backgroundColor: colors.surfaceContainer },
  message: { padding: spacing.md, borderRadius: radius.md },
  messageText: typography.body,
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noteText: { ...typography.body, color: colors.onSurfaceVariant, flex: 1 },
});

export default MoveMenu;
