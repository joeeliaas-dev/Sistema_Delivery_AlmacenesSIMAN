// src/features/driver/PhotoCapture.js (dueño: P3)
// Foto de evidencia con la cámara (en web, expo-image-picker abre la cámara o el selector).
// Solo cámara: el botón "Usar de ejemplo" del prototipo no se lleva a la app (N10).
// Vacía: recuadro punteado con ícono y texto. Lista: la foto con botón de borrar; el paso pasa a verde.
// En web la foto se guarda como data URL comprimida para que sobreviva a una recarga (N26).
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { colors, radius, spacing, typography } from '../../theme';
import { photoForDraft } from './draftStorage';
import { EmptyEvidence } from './EvidenceParts';
import { SectionLabel } from './SectionLabel';

export function PhotoCapture({ uri, onChange, label = 'Foto de evidencia', step }) {
  const [error, setError] = useState(null);

  const takePhoto = async () => {
    setError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('Permita el acceso a la cámara para tomar la foto.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets?.[0]?.uri) onChange(await photoForDraft(result.assets[0].uri));
    } catch {
      setError('No se pudo abrir la cámara. Intente de nuevo.');
    }
  };

  return (
    <View>
      <SectionLabel step={step} done={!!uri}>
        {label}
      </SectionLabel>
      {uri ? (
        <View style={styles.preview}>
          <Image source={{ uri }} style={styles.image} resizeMode="cover" accessibilityLabel={label} />
          <Pressable
            onPress={() => onChange(null)}
            style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}
            accessibilityRole="button"
            accessibilityLabel="Borrar foto"
          >
            <Icon name="delete" size={20} color={colors.onSurface} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={takePhoto}
          accessibilityRole="button"
          accessibilityLabel="Tomar foto"
          style={({ pressed }) => [styles.empty, pressed && styles.pressed]}
        >
          <EmptyEvidence icon="photo_camera" label="Tomar foto" />
        </Pressable>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { height: 180, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceHigh },
  image: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePressed: { backgroundColor: colors.surfaceHigh, transform: [{ scale: 0.94 }] },
  empty: {
    height: 120,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.surfaceContainer, transform: [{ scale: 0.98 }] },
  error: { ...typography.caption, color: colors.error, marginTop: spacing.sm, paddingHorizontal: spacing.xs },
});

export default PhotoCapture;
