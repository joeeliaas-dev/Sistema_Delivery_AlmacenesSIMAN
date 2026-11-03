// src/features/driver/SignaturePad.js (dueño: P3) — Android e iOS
// react-native-signature-canvas (WebView). Al soltar el trazo se lee la firma y se entrega
// como "data:image/png;base64,..." en onChange; onActiveChange avisa para bloquear el scroll mientras se firma.
// En web se usa SignaturePad.web.js (este paquete no funciona en web).
import { useRef } from 'react';
import SignatureCanvas from 'react-native-signature-canvas';
import { PAD_BACKGROUND, PEN_COLOR, SignatureFrame } from './SignatureFrame';

// Sin pie ni bordes propios del paquete: el marco lo pone SignatureFrame
const WEB_STYLE = `
  .m-signature-pad { box-shadow: none; border: none; background: ${PAD_BACKGROUND}; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { display: none; margin: 0; }
  body, html { background: ${PAD_BACKGROUND}; height: 100%; }
`;

export function SignaturePad({ value, onChange, onActiveChange, step }) {
  const ref = useRef(null);

  const clear = () => {
    ref.current?.clearSignature();
    onChange(null);
  };

  return (
    <SignatureFrame hasSignature={!!value} onClear={clear} step={step}>
      <SignatureCanvas
        ref={ref}
        onBegin={() => onActiveChange?.(true)}
        onEnd={() => {
          onActiveChange?.(false);
          ref.current?.readSignature();
        }}
        onOK={(signature) => onChange(signature)}
        onEmpty={() => onChange(null)}
        autoClear={false}
        imageType="image/png"
        penColor={PEN_COLOR}
        backgroundColor={PAD_BACKGROUND}
        webStyle={WEB_STYLE}
        webviewContainerStyle={{ backgroundColor: 'transparent' }}
      />
    </SignatureFrame>
  );
}

export default SignaturePad;
