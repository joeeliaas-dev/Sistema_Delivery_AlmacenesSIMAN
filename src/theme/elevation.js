// src/theme/elevation.js (dueño: P3)
// Sombras suaves con el tono morado del prototipo (#24154F). boxShadow funciona igual
// en Android, iOS y web (React Native 0.86).
//   0  plano (tarjetas grises del prototipo)
//   1  apenas despegado (paneles blancos, botón lleno)
//   2  tarjeta destacada (Próxima parada, shadow-md del prototipo)
//   3  flotante (avisos sobre el contenido)
export const elevation = {
  0: {},
  1: { boxShadow: '0px 1px 3px rgba(36, 21, 79, 0.10), 0px 1px 2px rgba(36, 21, 79, 0.06)' },
  2: { boxShadow: '0px 4px 10px rgba(36, 21, 79, 0.14), 0px 2px 4px rgba(36, 21, 79, 0.08)' },
  3: { boxShadow: '0px 10px 24px rgba(36, 21, 79, 0.18), 0px 4px 8px rgba(36, 21, 79, 0.10)' },
};
