import { MaterialIcons } from '@expo/vector-icons';
import { Roboto_400Regular, Roboto_500Medium, Roboto_700Bold, useFonts } from '@expo-google-fonts/roboto';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../src/components/Icon';
import { USE_MOCKS } from '../src/lib/firebase';
import { MOCKS_PERSISTED, mockDb } from '../src/mocks';
import { colors, elevation, radius, spacing, typography } from '../src/theme';
const VIEWS = [
  {
    href: '/despacho',
    label: 'Despacho',
    icon: 'local_shipping',
    a11y: 'Centro de despacho',
  },
  {
    href: '/motorista',
    label: 'Motorista',
    icon: 'two_wheeler',
    a11y: 'Vista motorista',
  },
  {
    href: '/entrega',
    label: 'Confirmación',
    icon: 'task_alt',
    a11y: 'Confirmar entrega',
  },
];
function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {VIEWS.map(({ href, label, icon, a11y }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const color = active ? colors.primary : colors.onSurfaceVariant;
        return (
          <Pressable
            key={href}
            accessibilityRole="tab"
            accessibilityLabel={a11y}
            accessibilityState={{
              selected: active,
            }}
            onPress={() => !active && router.replace(href)}
            style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && !active && styles.tabPressed]}
          >
            <Icon name={icon} size={18} color={color} />
            <Text
              style={[
                styles.tabText,
                {
                  color,
                },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
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
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Reiniciar',
          style: 'destructive',
          onPress: reset,
        },
      ]);
    }
  };
  return (
    <View style={styles.mockBar}>
      <View style={styles.mockDot} />
      <Text style={styles.mockTag}>{MOCKS_PERSISTED ? 'Datos de prueba locales' : 'Datos de prueba'}</Text>
      <Pressable onPress={confirmReset} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.mockReset}>Reiniciar datos</Text>
      </Pressable>
    </View>
  );
}
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
    ...MaterialIcons.font,
  });
  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.loading}>
        <Image source={require('../assets/splash-icon.png')} style={styles.logo} accessibilityLabel="Trazza" />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <TopBar />
        {USE_MOCKS ? <MockBar /> : null}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: colors.surface,
            },
          }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  bar: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceContainer,
  },
  loading: {
    flex: 1,
    gap: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  logo: {
    width: 88,
    height: 88,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    gap: spacing.xxs,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
  },
  tabActive: {
    backgroundColor: colors.white,
    ...elevation[1],
  },
  tabPressed: {
    backgroundColor: colors.surfaceHigh,
  },
  tabText: {
    ...typography.captionStrong,
  },
  mockBar: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
    backgroundColor: colors.kpiAccentContainer,
  },
  mockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.kpiAccent,
  },
  mockTag: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
  },
  mockReset: {
    ...typography.captionStrong,
    color: colors.primary,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
});
