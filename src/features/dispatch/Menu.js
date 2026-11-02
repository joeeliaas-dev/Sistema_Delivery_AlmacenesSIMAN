// src/features/dispatch/Menu.js  (dueño: P2)
// Menú desplegable del despacho (rediseño 30 oct): el botón "Más" y el selector de zona.
// Se abre debajo del botón, encima de lo que siga (mapa incluido), y se cierra al elegir o al
// volver a tocar el botón. En la web cada View de React Native es su propio contexto de apilado
// (zIndex 0): quien lo use pone zIndex en el contenedor que es hermano del mapa.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { colors, elevation, radius, spacing, typography } from '../../theme';

/**
 * @param {{ label: string, accessibilityLabel: string, align?: 'left'|'right', style?: object,
 *   items: Array<{ key: string, label: string, accessibilityLabel?: string, selected?: boolean,
 *     disabled?: boolean, onPress: () => void }> }} props
 */
export function Menu({ label, accessibilityLabel, items, align = 'left', style }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.wrap, open && styles.wrapOpen, style]}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.buttonText} numberOfLines={1}>
          {label}
        </Text>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={20} color={colors.onSurfaceVariant} />
      </Pressable>
      {open ? (
        <View style={[styles.menu, align === 'right' ? styles.right : styles.left]} accessibilityRole="menu">
          {items.map((it) => (
            <Pressable
              key={it.key}
              onPress={() => {
                setOpen(false);
                it.onPress();
              }}
              disabled={it.disabled}
              accessibilityRole="menuitem"
              accessibilityLabel={it.accessibilityLabel ?? it.label}
              accessibilityState={{ selected: Boolean(it.selected), disabled: Boolean(it.disabled) }}
              style={({ pressed }) => [styles.item, it.selected && styles.itemSelected, pressed && styles.pressed]}
            >
              <Text
                style={[styles.itemText, it.selected && styles.itemTextSelected, it.disabled && styles.disabled]}
                numberOfLines={1}
              >
                {it.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { zIndex: 1, flexShrink: 1 },
  wrapOpen: { zIndex: 50 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 44,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.white,
  },
  buttonText: { ...typography.label, color: colors.onSurface, flexShrink: 1 },
  pressed: { backgroundColor: colors.surfaceContainer },
  menu: {
    position: 'absolute',
    top: 48,
    minWidth: 220,
    maxWidth: 320,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    ...elevation[3],
  },
  left: { left: 0 },
  right: { right: 0 },
  item: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },
  itemSelected: { backgroundColor: colors.primaryContainer },
  itemText: { ...typography.body, color: colors.onSurface },
  itemTextSelected: { fontFamily: typography.fonts.medium, color: colors.onPrimaryContainer },
  disabled: { color: colors.disabledContent },
});

export default Menu;
