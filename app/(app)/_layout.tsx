import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerBackTitle: '',
      }}
    >
      <Stack.Screen name="home" options={{ title: 'Mis Viajes' }} />
      <Stack.Screen name="profile" options={{ title: 'Perfil' }} />
      <Stack.Screen
        name="trip/[id]"
        options={{ headerShown: false }}
      />
    </Stack>
  );
}
