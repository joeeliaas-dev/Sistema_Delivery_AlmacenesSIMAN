// src/features/importer/DropZone.web.js (dueño: P3) — web
// Paso 1 de Importar pedidos: zona para soltar el Excel o CSV, botón "Elegir archivo" y
// enlace "Descargar plantilla". Usa los eventos del navegador (no hay selector de archivos en el teléfono).
// <DropZone onFile={(file) => …} onTemplate={() => …} busy? />
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { colors, radius, spacing, typography } from '../../theme';

const ACCEPT = '.xlsx,.xls,.csv';

export function DropZone({ onFile, onTemplate, busy = false }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  const take = (files) => {
    const file = files?.[0];
    if (file && !busy) onFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer?.files);
      }}
      style={{
        border: `1px dashed ${over ? colors.primary : colors.outline}`,
        background: over ? colors.primaryContainer : colors.white,
        borderRadius: radius.md,
        padding: `${spacing.xxxl}px ${spacing.lg}px`,
        transition: 'background 150ms, border-color 150ms',
      }}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Suelte aquí el Excel de pedidos</Text>
        <Text style={styles.body}>.xlsx o .csv</Text>
        <Button
          title={busy ? 'Leyendo…' : 'Elegir archivo'}
          disabled={busy}
          onPress={() => inputRef.current?.click()}
          style={styles.button}
        />
        <Button title="Descargar plantilla" variant="text" size="md" onPress={onTemplate} />
      </View>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        aria-label="Elegir archivo de pedidos"
        style={{ display: 'none' }}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = ''; // permite volver a elegir el mismo archivo
        }}
      />
    </div>
  );
}

const styles = StyleSheet.create({
  inner: { alignItems: 'center', gap: spacing.sm },
  title: { ...typography.title, color: colors.onSurface, textAlign: 'center' },
  body: { ...typography.body, color: colors.onSurfaceVariant, textAlign: 'center' },
  button: { marginTop: spacing.md, minWidth: 220 },
});

export default DropZone;
