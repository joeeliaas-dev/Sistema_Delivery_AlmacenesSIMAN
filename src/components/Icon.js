// src/components/Icon.js (dueño: P3)
// El prototipo usa Material Symbols; aquí se usa MaterialIcons de @expo/vector-icons (viene con Expo).
// Acepta el nombre con guion bajo como en el Figma (task_alt) o con guion (task-alt).
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme';

export function Icon({ name, size = 20, color = colors.onSurface, style }) {
  // Decorativo: el texto del botón o accessibilityLabel describe la acción (en web evita leer el glifo)
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
