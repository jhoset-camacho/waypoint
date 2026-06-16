import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/useAuth';
import { colors, spacing, typography } from '@/constants/theme';

export default function LoginScreen() {
  const { signInWithApple, signInWithGoogle, enableDevBypass } = useAuth();

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Waypoint</Text>
          <Text style={styles.subtitle}>
            Tu asistente de viajes
          </Text>
        </View>

        <View style={styles.buttons}>
          <Button
            title="Continuar con Apple"
            onPress={signInWithApple}
            variant="primary"
            style={styles.appleButton}
          />
          <Button
            title="Continuar con Google"
            onPress={signInWithGoogle}
            variant="outline"
          />

          {__DEV__ && (
            <Button
              title="Entrar sin cuenta (dev)"
              onPress={enableDevBypass}
              variant="secondary"
              style={styles.devButton}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl * 2,
  },
  header: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...typography.h1,
    fontSize: 36,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  buttons: {
    gap: spacing.md,
  },
  appleButton: {
    backgroundColor: '#000000',
  },
  devButton: {
    marginTop: spacing.sm,
  },
});
