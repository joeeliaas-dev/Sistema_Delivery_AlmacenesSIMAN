import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme';
export function Icon({ name, size = 20, color = colors.onSurface, style }) {
  return (
    <MaterialIcons
      name={name.replace(/_/g, '-')}
      size={size}
      color={color}
      style={style}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
export default Icon;
