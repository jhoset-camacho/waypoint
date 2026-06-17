import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Message } from '@/types';

export function useMessages(tripId: string) {
  const queryClient = useQueryClient();

  const query = useQuery<Message[]>({
    queryKey: ['messages', tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tripId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!tripId) return;

    const channel = supabase
      .channel(`messages:${tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          queryClient.setQueryData<Message[]>(
            ['messages', tripId],
            (prev) => {
              const current = prev ?? [];
              const exists = current.some((m) => m.id === payload.new.id);
              if (exists) return current;
              return [...current, payload.new as Message];
            },
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, queryClient]);

  return query;
}
