import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/useAuth';
import { colors, spacing, typography } from '@/constants/theme';

export default function LoginScreen() {
  const { signInWithApple, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDevAuth = async () => {
    if (!email || !password) {
      Alert.alert('Faltan datos', 'Ingresa email y contraseña');
      return;
    }
    setLoading(true);
    if (isSignUp) {
      const { error } = await signUpWithEmail(email, password, name || undefined);
      if (error) Alert.alert('Error al registrar', error);
    } else {
      const { error } = await signInWithEmail(email, password);
      if (error) Alert.alert('Error al entrar', error);
    }
    setLoading(false);
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Waypoint</Text>
            <Text style={styles.subtitle}>Tu asistente de viajes</Text>
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
          </View>

          {__DEV__ && (
            <View style={styles.devSection}>
              <Text style={styles.devLabel}>
                — Acceso desarrollo —
              </Text>

              {isSignUp && (
                <TextInput
                  style={styles.input}
                  placeholder="Nombre"
                  placeholderTextColor={colors.textSecondary}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              )}
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={colors.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={styles.input}
                placeholder="Contraseña"
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <Button
                title={isSignUp ? 'Crear cuenta (dev)' : 'Entrar (dev)'}
                onPress={handleDevAuth}
                variant="secondary"
                disabled={loading}
              />

              <Button
                title={isSignUp ? '¿Ya tienes cuenta? Entrar' : '¿Sin cuenta? Crear'}
                onPress={() => setIsSignUp(!isSignUp)}
                variant="outline"
                style={styles.toggleButton}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
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
    marginBottom: spacing.xl,
  },
  appleButton: {
    backgroundColor: '#000000',
  },
  devSection: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  devLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
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
  toggleButton: {
    marginTop: spacing.xs,
  },
});
