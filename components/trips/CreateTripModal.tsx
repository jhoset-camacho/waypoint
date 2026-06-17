import { useState } from 'react';
import {
  View, Text, TextInput, Modal, StyleSheet,
  KeyboardAvoidingView, Platform, Pressable, Alert,
} from 'react-native';
import { Button } from '@/components/ui/Button';
import { useCreateTrip } from '@/features/trips/useCreateTrip';
import { colors, spacing, typography } from '@/constants/theme';

type CreateTripModalProps = {
  visible: boolean;
  onClose: () => void;
  onCreated: (tripId: string) => void;
};

export function CreateTripModal({ visible, onClose, onCreated }: CreateTripModalProps) {
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const { mutate: createTrip, isPending } = useCreateTrip();

  const handleCreate = () => {
    createTrip(
      { title: title.trim() || undefined, destination: destination.trim() || undefined },
      {
        onSuccess: (trip) => {
          setTitle('');
          setDestination('');
          onCreated(trip.id);
        },
        onError: (error) => {
          const raw = error.message ?? '';
          const userMessage = raw.includes('foreign key') || raw.includes('violates')
            ? 'No se pudo crear el viaje. Intenta cerrar sesión y volver a entrar.'
            : 'Ocurrió un error al crear el viaje. Inténtalo de nuevo.';
          Alert.alert('Error', userMessage);
        },
      },
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Nuevo viaje</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.closeText}>Cancelar</Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Nombre del viaje</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. Grecia con Carmen"
              placeholderTextColor={colors.textSecondary}
              value={title}
              onChangeText={setTitle}
              autoCapitalize="sentences"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Destino</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. Atenas, Grecia"
              placeholderTextColor={colors.textSecondary}
              value={destination}
              onChangeText={setDestination}
              autoCapitalize="sentences"
            />
          </View>

          <Text style={styles.hint}>
            Puedes agregar fechas y más detalles desde el chat del viaje.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            title={isPending ? 'Creando...' : 'Empezar a planear'}
            onPress={handleCreate}
            disabled={isPending}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  closeText: {
    ...typography.body,
    color: colors.primary,
  },
  form: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  actions: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
