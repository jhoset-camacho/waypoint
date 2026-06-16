import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/useAuth';
import { colors, spacing, typography } from '@/constants/theme';

export default function ProfileScreen() {
  const { user, devBypass, signOut } = useAuth();

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.info}>
          <Text style={styles.label}>Cuenta</Text>
          <Text style={styles.value}>
            {devBypass
              ? 'Modo desarrollo (sin cuenta)'
              : user?.email ?? 'Sin sesión'}
          </Text>
        </View>

        <Button
          title="Cerrar sesión"
          onPress={signOut}
          variant="outline"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.xl,
  },
  info: {
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  value: {
    ...typography.body,
    color: colors.text,
  },
});
