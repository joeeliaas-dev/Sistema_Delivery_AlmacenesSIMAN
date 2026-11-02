// src/theme/elevation.js (dueño: P3)
// Rediseño (30 oct): las tarjetas van planas con borde de 1 px; la sombra queda solo para lo que
// flota sobre el contenido (avisos, barra fija de abajo). boxShadow funciona en Android, iOS y web.
//   0, 1  plano (1 era "apenas despegado"; ahora lo da el borde)
//   2     flotante leve (barra fija, aviso)
//   3     flotante (menús)
export const elevation = {
  0: {},
  1: {},
  2: { boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)' },
  3: { boxShadow: '0px 6px 20px rgba(0, 0, 0, 0.12)' },
};
