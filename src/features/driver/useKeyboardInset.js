// src/features/driver/useKeyboardInset.js (dueño: P3)
// Cuánto tapa el teclado la parte de abajo de la pantalla, para dejar ese espacio libre y que
// la descripción y el botón inferior queden encima del teclado.
// - Android/iOS: eventos de Keyboard + posición real de la pantalla (si la ventana ya se encogió, da 0).
// - Web (navegador del teléfono): visualViewport, que se achica cuando sale el teclado.
// Uso: const { ref, inset } = useKeyboardInset();  <View ref={ref} style={{ flex: 1, paddingBottom: inset }}>
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardInset() {
  const ref = useRef(null);
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!vv) return undefined;
      const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      return () => {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      };
    }

    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const keyboardTop = e.endCoordinates.screenY;
      ref.current?.measureInWindow((x, y, width, height) =>
        setInset(Math.max(0, Math.round(y + height - keyboardTop))),
      );
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return { ref, inset };
}
