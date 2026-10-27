import { StyleSheet, View } from 'react-native';
import { tones } from '../theme';
import { Icon } from './Icon';
export function IconTile({ icon, tone = 'primary', size = 48, style }) {
  const t = tones[tone] ?? tones.primary;
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size / 3),
          backgroundColor: t.bg,
        },
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={t.accent} />
    </View>
  );
}
const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
export default IconTile;
