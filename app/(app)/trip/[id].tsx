import { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView,
  Pressable, FlatList, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { useTrip } from '@/features/trips/useTrip';
import { useMessages } from '@/features/chat/useMessages';
import { useSendMessage } from '@/features/chat/useSendMessage';
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
  const flatListRef = useRef<FlatList>(null);

  const { data: trip } = useTrip(id);
  const { data: messages, isLoading: messagesLoading } = useMessages(id);
  const { mutate: sendMessage, isPending: sending } = useSendMessage();

  const goToTab = (index: number) => {
    setActiveTab(index);
    pagerRef.current?.setPage(index);
  };

  const handleSend = useCallback((content: string) => {
    sendMessage({ tripId: id, content });
  }, [id, sendMessage]);

  // Auto-scroll when messages change
  const handleContentSizeChange = useCallback(() => {
    if (messages?.length) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages?.length]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
          <Text style={styles.backText}>‹ Viajes</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {trip?.title ?? '...'}
        </Text>
        <View style={styles.headerRight} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab, index) => (
          <Pressable
            key={tab.key}
            style={styles.tabItem}
            onPress={() => goToTab(index)}
          >
            <Text style={[styles.tabLabel, activeTab === index && styles.tabLabelActive]}>
              {tab.label}
            </Text>
            {activeTab === index && <View style={styles.tabIndicator} />}
          </Pressable>
        ))}
      </View>

      {/* Content pages */}
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setActiveTab(e.nativeEvent.position)}
      >
        {/* Chat */}
        <View key="chat" style={styles.page}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            {messagesLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <MessageBubble message={item} />}
                contentContainerStyle={styles.messageList}
                onContentSizeChange={handleContentSizeChange}
                onLayout={handleContentSizeChange}
              />
            )}
            <ChatInput onSend={handleSend} disabled={sending} />
          </KeyboardAvoidingView>
        </View>

        {/* Mapa */}
        <View key="map" style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Mapa</Text>
          <Text style={styles.placeholderHint}>Disponible en F3</Text>
        </View>

        {/* Plan */}
        <View key="plan" style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Plan</Text>
          <Text style={styles.placeholderHint}>Disponible en F4</Text>
        </View>

        {/* Notas */}
        <View key="notes" style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Notas</Text>
          <Text style={styles.placeholderHint}>Disponible en F5</Text>
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
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 80,
  },
  backText: {
    ...typography.body,
    color: colors.primary,
  },
  headerTitle: {
    flex: 1,
    ...typography.bodyBold,
    color: colors.text,
    textAlign: 'center',
  },
  headerRight: {
    width: 80,
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
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageList: {
    paddingVertical: spacing.md,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  placeholderTitle: {
    ...typography.h2,
    color: colors.text,
  },
  placeholderHint: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
