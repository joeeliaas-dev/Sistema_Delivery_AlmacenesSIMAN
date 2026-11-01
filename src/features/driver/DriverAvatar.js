// src/features/driver/DriverAvatar.js (dueño: P3)
// Iniciales del motorista sobre el color de su zona (zones.color). Si el blanco no llega a
// 4.5:1 sobre ese color (p. ej. el naranja de Z4), las iniciales van oscuras.
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../../theme';

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const whiteContrast = (hex) => 1.05 / (luminance(hex) + 0.05);

export function DriverAvatar({ initials, color = colors.primary, size = 48 }) {
  const valid = /^#[0-9a-f]{6}$/i.test(color ?? '');
  const bg = valid ? color : colors.primary;
  const fg = whiteContrast(bg) >= 4.5 ? colors.white : colors.onSurface;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.initials, { color: fg, fontSize: Math.round(size * 0.33) }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  initials: { fontFamily: typography.fonts.bold },
});

export default DriverAvatar;
