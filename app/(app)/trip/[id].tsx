import { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, spacing, typography } from '@/constants/theme';

const TABS = [
  { key: 'chat', label: 'Chat' },
  { key: 'map', label: 'Mapa' },
  { key: 'plan', label: 'Plan' },
  { key: 'notes', label: 'Notas' },
] as const;

export default function TripWorkspace() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);
  const pagerRef = useRef<PagerView>(null);

  const goToTab = (index: number) => {
    setActiveTab(index);
    pagerRef.current?.setPage(index);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Viajes</Text>
        </Pressable>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab, index) => (
          <Pressable
            key={tab.key}
            style={styles.tabItem}
            onPress={() => goToTab(index)}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === index && styles.tabLabelActive,
              ]}
            >
              {tab.label}
            </Text>
            {activeTab === index && <View style={styles.tabIndicator} />}
          </Pressable>
        ))}
      </View>

      {/* Content */}
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setActiveTab(e.nativeEvent.position)}
      >
        <View key="chat" style={styles.page}>
          <Text style={styles.pageTitle}>Chat</Text>
          <Text style={styles.pageHint}>Aquí conversarás con tu asistente de viaje</Text>
        </View>

        <View key="map" style={styles.page}>
          <Text style={styles.pageTitle}>Mapa</Text>
          <Text style={styles.pageHint}>Aquí verás tus lugares en el mapa</Text>
        </View>

        <View key="plan" style={styles.page}>
          <Text style={styles.pageTitle}>Plan</Text>
          <Text style={styles.pageHint}>Aquí organizarás tu itinerario por días</Text>
        </View>

        <View key="notes" style={styles.page}>
          <Text style={styles.pageTitle}>Notas</Text>
          <Text style={styles.pageHint}>Aquí guardarás información importante del viaje</Text>
        </View>
      </PagerView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backText: {
    ...typography.body,
    color: colors.primary,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
  },
  tabLabel: {
    ...typography.bodyBold,
    fontSize: 14,
    color: colors.textSecondary,
  },
  tabLabelActive: {
    color: colors.primary,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: spacing.md,
    right: spacing.md,
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pageTitle: {
    ...typography.h2,
    color: colors.text,
  },
  pageHint: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
});
