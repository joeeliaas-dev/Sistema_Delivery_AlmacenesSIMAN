import { StyleSheet, Text } from 'react-native';
import { colors, typography } from '../theme';
export function Eyebrow({ children, color = colors.primary, style }) {
  return (
    <Text
      style={[
        styles.text,
        {
          color,
        },
        style,
      ]}
      numberOfLines={1}
    >
      {children}
    </Text>
  );
}
const styles = StyleSheet.create({
  text: typography.eyebrow,
});
export default Eyebrow;
