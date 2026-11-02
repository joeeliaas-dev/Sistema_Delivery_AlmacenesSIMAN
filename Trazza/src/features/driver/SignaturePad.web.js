// src/features/driver/SignaturePad.web.js (dueño: P3) — solo vista previa web
// <canvas> simple con la misma interfaz que SignaturePad.js: onChange("data:image/png;base64,..." | null).
// Si ya hay una firma (borrador guardado, N26), se vuelve a dibujar al montar o al cambiar de tamaño.
import { useRef } from 'react';
import { View } from 'react-native';
import { PEN_COLOR, SIGNATURE_HEIGHT, SignatureFrame } from './SignatureFrame';

export function SignaturePad({ value, onChange, onActiveChange, step }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  const context = () => canvasRef.current?.getContext('2d');

  // Dibuja una firma guardada (data URL) ocupando todo el lienzo
  const drawSaved = (dataUrl, width, height) => {
    const img = new window.Image();
    img.onload = () => {
      context()?.drawImage(img, 0, 0, width, height);
      hasInk.current = true;
    };
    img.src = dataUrl;
  };

  // Ajusta el lienzo a su tamaño real y a la densidad de pantalla; si hay firma, la redibuja
  const onLayout = ({ nativeEvent }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = nativeEvent.layout;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = context();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PEN_COLOR;
    hasInk.current = false;
    if (value) drawSaved(value, width, height);
  };

  const point = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e) => {
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = point(e);
    const ctx = context();
    ctx.beginPath();
    ctx.moveTo(x, y);
    onActiveChange?.(true);
  };

  const onPointerMove = (e) => {
    if (!drawing.current) return;
    const { x, y } = point(e);
    const ctx = context();
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
  };

  const onPointerEnd = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onActiveChange?.(false);
    if (hasInk.current) onChange(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    context()?.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    onChange(null);
  };

  return (
    <SignatureFrame hasSignature={!!value} onClear={clear} step={step}>
      <View style={{ height: SIGNATURE_HEIGHT }} onLayout={onLayout}>
        <canvas
          ref={canvasRef}
          aria-label="Firma del cliente"
          style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={onPointerEnd}
        />
      </View>
    </SignatureFrame>
  );
}

export default SignaturePad;
