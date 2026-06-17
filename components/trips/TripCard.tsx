import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Trip } from '@/types';
import { colors, spacing, typography } from '@/constants/theme';

type TripCardProps = {
  trip: Trip;
  onPress: () => void;
};

const STATUS_LABELS: Record<Trip['status'], string> = {
  draft: 'Borrador',
  active: 'Activo',
  inactive: 'Inactivo',
  archived: 'Archivado',
};

const STATUS_COLORS: Record<Trip['status'], string> = {
  draft: colors.textSecondary,
  active: colors.success,
  inactive: colors.warning,
  archived: colors.border,
};

function formatDate(date: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function TripCard({ trip, onPress }: TripCardProps) {
  const startDate = formatDate(trip.start_date);
  const endDate = formatDate(trip.end_date);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {trip.title}
          </Text>
          {trip.destination ? (
            <Text style={styles.destination} numberOfLines={1}>
              {trip.destination}
            </Text>
          ) : null}
          {startDate ? (
            <Text style={styles.dates}>
              {startDate}{endDate ? ` → ${endDate}` : ''}
            </Text>
          ) : null}
        </View>

        <View style={styles.right}>
          <View style={[styles.badge, { borderColor: STATUS_COLORS[trip.status] }]}>
            <Text style={[styles.badgeText, { color: STATUS_COLORS[trip.status] }]}>
              {STATUS_LABELS[trip.status]}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.bodyBold,
    color: colors.text,
  },
  destination: {
    ...typography.body,
    color: colors.textSecondary,
  },
  dates: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  right: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '600',
  },
  chevron: {
    ...typography.h2,
    color: colors.border,
  },
});
