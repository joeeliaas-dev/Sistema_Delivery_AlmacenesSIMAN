// src/lib/combine.js  (dueño: P1)
// Une varias lecturas en tiempo real en una sola: llama cb cuando todas dieron su primer
// valor y después en cada cambio de cualquiera. Devuelve la función para cancelar todas.

/**
 * @param {Array<(cb: Function) => () => void>} subscribes  cada una recibe su cb y devuelve cancelar
 * @param {(...values) => any} merge  arma el resultado con el último valor de cada lectura
 * @param {(value) => void} cb
 * @returns {() => void} cancelar
 */
export function combine(subscribes, merge, cb) {
  const values = new Array(subscribes.length);
  const seen = new Array(subscribes.length).fill(false);
  let cancelled = false;
  const cancels = subscribes.map((subscribe, i) =>
    subscribe((value) => {
      if (cancelled) return;
      values[i] = value;
      seen[i] = true;
      if (seen.every(Boolean)) cb(merge(...values));
    }),
  );
  return () => {
    cancelled = true;
    cancels.forEach((cancel) => cancel?.());
  };
}
