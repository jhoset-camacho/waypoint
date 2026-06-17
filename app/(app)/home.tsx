import { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  Pressable, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { TripCard } from '@/components/trips/TripCard';
import { CreateTripModal } from '@/components/trips/CreateTripModal';
import { useTrips } from '@/features/trips/useTrips';
import { colors, spacing, typography } from '@/constants/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { data: trips, isLoading, isError } = useTrips();
  const [showCreate, setShowCreate] = useState(false);

  const handleTripCreated = (tripId: string) => {
    setShowCreate(false);
    router.push(`/(app)/trip/${tripId}`);
  };

  return (
    <Screen>
      <View style={styles.container}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>Error al cargar viajes</Text>
          </View>
        ) : (
          <FlatList
            data={trips}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TripCard
                trip={item}
                onPress={() => router.push(`/(app)/trip/${item.id}`)}
              />
            )}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>✈️</Text>
                <Text style={styles.emptyTitle}>Aún no tienes viajes</Text>
                <Text style={styles.emptySubtitle}>
                  Crea tu primer viaje para empezar a planear
                </Text>
              </View>
            }
          />
        )}

        <View style={styles.footer}>
          <Button title="+ Nuevo viaje" onPress={() => setShowCreate(true)} />
          <Pressable
            style={styles.profileLink}
            onPress={() => router.push('/(app)/profile')}
          >
            <Text style={styles.profileText}>Perfil</Text>
          </Pressable>
        </View>
      </View>

      <CreateTripModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleTripCreated}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
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
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  profileLink: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  profileText: {
    ...typography.body,
    color: colors.primary,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
});
