// src/features/session/loginMath.js (dueño: P3)
// Revisión previa de la pantalla de entrada, antes de llamar a signIn: campos vacíos o un correo sin
// forma de correo. La respuesta definitiva (cuenta o contraseña mala) la da signIn de P1.

/** { email?: string, password?: string } con el mensaje de cada campo; {} si se puede enviar. */
export function loginFieldErrors(email, password) {
  const errors = {};
  const e = String(email ?? '').trim();
  if (!e) errors.email = 'Escriba su correo';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) errors.email = 'Revise el correo: debe ser como nombre@empresa.com';
  if (!password) errors.password = 'Escriba su contraseña';
  return errors;
}
