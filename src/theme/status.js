// src/theme/status.js (dueño: P3)
// Un color por estado, siempre el mismo (V5): píldoras, pines, bordes, contadores y tarjetas.
// Cada tono trae tres colores:
//   accent  íconos, barras laterales, pines y líneas
//   fg      texto sobre bg (contraste ≥ 4.5:1, C16)
//   bg      fondo claro (píldoras, IconTile)
import { STATUS } from '../constants';
import { colors } from './colors';

export const tones = {
  warning: { accent: colors.warning, fg: colors.onWarningContainer, bg: colors.warningContainer },
  info: { accent: colors.info, fg: colors.info, bg: colors.infoContainer },
  success: { accent: colors.success, fg: colors.onSuccessContainer, bg: colors.successContainer },
  error: { accent: colors.error, fg: colors.error, bg: colors.errorContainer },
  neutral: { accent: colors.neutral, fg: colors.neutral, bg: colors.neutralContainer },
  // Express (V5: rosa)
  tertiary: { accent: colors.tertiary, fg: colors.onTertiaryContainer, bg: colors.tertiaryContainer },
  primary: { accent: colors.primary, fg: colors.onPrimaryContainer, bg: colors.primaryContainer },
};

const BY_STATUS = {
  [STATUS.PENDIENTE]: { tone: 'warning', icon: 'schedule', label: 'Pendiente' },
  [STATUS.ASIGNADO]: { tone: 'info', icon: 'route', label: 'Asignado' },
  [STATUS.EN_RUTA]: { tone: 'info', icon: 'two_wheeler', label: 'En ruta' },
  [STATUS.ENTREGADO]: { tone: 'success', icon: 'task_alt', label: 'Entregado' },
  [STATUS.NO_ENTREGADO]: { tone: 'error', icon: 'close', label: 'No entregado' },
  [STATUS.DEVUELTO]: { tone: 'neutral', icon: 'undo', label: 'Devuelto' },
};

/**
 * Color, ícono y texto de un estado de envío.
 * @param {string} status  STATUS.*
 * @returns {{ tone: string, accent: string, fg: string, bg: string, icon: string, label: string }}
 */
export function statusTone(status) {
  const s = BY_STATUS[status] ?? { tone: 'neutral', icon: 'help_outline', label: status ?? '' };
  return { tone: s.tone, ...tones[s.tone], icon: s.icon, label: s.label };
}
