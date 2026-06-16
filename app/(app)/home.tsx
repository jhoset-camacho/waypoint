import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/constants/theme';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>✈️</Text>
          <Text style={styles.emptyTitle}>
            Aún no tienes viajes
          </Text>
          <Text style={styles.emptySubtitle}>
            Crea tu primer viaje para empezar a planear
          </Text>
          <Button
            title="Empezar a planear"
            onPress={() => {
              // TODO F1: crear viaje y navegar al workspace
              router.push('/(app)/trip/demo');
            }}
            style={styles.createButton}
          />
        </View>

        <Pressable
          style={styles.profileLink}
          onPress={() => router.push('/(app)/profile')}
        >
          <Text style={styles.profileText}>Perfil</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.h2,
    color: colors.text,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  createButton: {
    minWidth: 200,
  },
  profileLink: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  profileText: {
    ...typography.body,
    color: colors.primary,
  },
});
