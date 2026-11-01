// app/_layout.js  (dueño: P1)
// Protección por sesión (C48): sin sesión se va a /login. Roles estrictos: el motorista solo abre su vista
// (/motorista y /entrega, sin barra; "Cerrar sesión" está en su menú Más) y el despachador solo el despacho,
// con una barra de su cuenta y "Salir".
// Carga las fuentes (Roboto y los íconos) antes de pintar, para que no salgan cuadrados vacíos.
import { MaterialIcons } from '@expo/vector-icons';
import { Roboto_400Regular, Roboto_500Medium, Roboto_700Bold, useFonts } from '@expo-google-fonts/roboto';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../src/components/Icon';
import { ROLE, canOpen, homeOf, signOut, useSession } from '../src/lib/auth';
import { USE_MOCKS } from '../src/lib/firebase';
import { MOCKS_PERSISTED, mockDb } from '../src/mocks';
import { colors, elevation, radius, spacing, typography } from '../src/theme';

// Barra de la cuenta del despachador: quién entró y "Salir" (ya no hay pestaña de motorista: roles estrictos)
function AccountBar({ user }) {
  return (
    <View style={styles.bar}>
      <Icon name="local_shipping" size={20} color={colors.primary} />
      <Text style={styles.barText} numberOfLines={1}>
        {user?.name ?? 'Despacho'} · {user?.email}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar sesión"
        onPress={signOut}
        style={({ pressed }) => [styles.logout, pressed && styles.tabPressed]}
      >
        <Icon name="logout" size={20} color={colors.onSurfaceVariant} />
        <Text style={styles.logoutText}>Salir</Text>
      </Pressable>
    </View>
  );
}

// Cuenta que entró pero no tiene rol (o está desactivada): no se abre nada
function NoAccess({ email }) {
  return (
    <View style={styles.loading}>
      <Text style={styles.noAccessTitle}>Su cuenta no tiene acceso</Text>
      <Text style={styles.noAccessText}>{email} todavía no tiene un rol asignado. Hable con el despacho.</Text>
      <Pressable accessibilityRole="button" onPress={signOut} style={styles.noAccessButton}>
        <Text style={styles.mockReset}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

// Solo en modo mocks: aviso de datos de prueba y botón para volver al inicio de la demo
function MockBar() {
  const router = useRouter();
  const reset = () => {
    mockDb.reset();
    router.replace('/despacho');
  };
  const confirmReset = () => {
    const message = 'Se borran las entregas y rutas de esta prueba y se vuelve a los datos iniciales.';
    if (Platform.OS === 'web') {
      if (window.confirm(`¿Reiniciar los datos de prueba?\n\n${message}`)) reset();
    } else {
      Alert.alert('¿Reiniciar los datos de prueba?', message, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Reiniciar', style: 'destructive', onPress: reset },
      ]);
    }
  };
  return (
    <View style={styles.mockBar}>
      <View style={styles.mockDot} />
      <Text style={styles.mockTag}>
        {MOCKS_PERSISTED ? 'Datos de prueba locales' : 'Datos de prueba'}
      </Text>
      <Pressable onPress={confirmReset} accessibilityRole="button" style={styles.mockResetHit}>
        <Text style={styles.mockReset}>Reiniciar datos</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const { status, user } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const role = user?.role ?? null;
  // Cada pantalla solo para quien puede abrirla; al entrar o salir, a la pantalla que corresponde
  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'signedOut') {
      if (pathname !== '/login') router.replace('/login');
    } else if (role && (pathname === '/login' || !canOpen(role, pathname))) router.replace(homeOf(role));
  }, [status, role, pathname, router]);

  const [fontsLoaded, fontError] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
    ...MaterialIcons.font,
  });
  // Si una fuente falla, se sigue con la del sistema en vez de dejar la pantalla en blanco
  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.loading}>
        {/* 176 px (26 KB) en vez del ícono de 1024 px (355 KB): se ve mientras cargan las fuentes */}
        <Image source={require('../assets/splash-small.png')} style={styles.logo} accessibilityLabel="Trazza" />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Sin saber aún si hay sesión, o camino a /login o a la vista del rol: no se muestra la pantalla de atrás
  const waiting =
    status === 'loading' ||
    (status === 'signedOut' && pathname !== '/login') ||
    (status === 'signedIn' && role && (pathname === '/login' || !canOpen(role, pathname)));
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        {status === 'signedIn' && role === ROLE.DESPACHO && pathname !== '/login' ? <AccountBar user={user} /> : null}
        {USE_MOCKS ? <MockBar /> : null}
        {/* El navegador siempre montado (router.replace lo necesita); encima, la espera o el aviso */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
        {status === 'signedIn' && !role ? (
          <View style={styles.cover}>
            <NoAccess email={user?.email} />
          </View>
        ) : null}
        {waiting ? (
          <View style={[styles.cover, styles.loading]}>
            <Image source={require('../assets/splash-small.png')} style={styles.logo} accessibilityLabel="Trazza" />
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceContainer,
  },
  loading: { flex: 1, gap: spacing.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  logo: { width: 88, height: 88 },
  // Ícono y texto en una línea: con 2 vistas cabe a 360 px
  tab: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
  },
  // Vista activa: píldora blanca elevada, como el prototipo
  tabActive: { backgroundColor: colors.white, ...elevation[1] },
  tabPressed: { backgroundColor: colors.surfaceHigh },
  tabText: { ...typography.bodyStrong },
  barText: { ...typography.bodyStrong, color: colors.onSurface, flex: 1 },
  logoutText: { ...typography.label, color: colors.onSurfaceVariant },
  logout: {
    minWidth: 44,
    minHeight: 44,
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  noAccessTitle: { ...typography.title, color: colors.onSurface },
  noAccessText: { ...typography.body, color: colors.onSurfaceVariant, textAlign: 'center', maxWidth: 320 },
  noAccessButton: { minHeight: 44, justifyContent: 'center' },
  cover: { ...StyleSheet.absoluteFillObject, zIndex: 10, backgroundColor: colors.surface },
  mockBar: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  // Aviso discreto: una línea gris, sin fondo (revisión visual del 30 oct)
  mockDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.onSurfaceVariant },
  mockTag: { ...typography.caption, color: colors.onSurfaceVariant },
  mockReset: { ...typography.captionStrong, color: colors.primary, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs },
  // Área táctil de 44 px sin agrandar la franja (en web no existe hitSlop)
  mockResetHit: { minHeight: 44, justifyContent: 'center', marginVertical: -12 },
});
