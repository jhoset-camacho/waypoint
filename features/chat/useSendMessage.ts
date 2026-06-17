import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Message } from '@/types';

type SendMessageInput = {
  tripId: string;
  content: string;
};

export function useSendMessage() {
  return useMutation<Message, Error, SendMessageInput>({
    mutationFn: async ({ tripId, content }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const { data, error } = await supabase
        .from('messages')
        .insert({
          trip_id: tripId,
          user_id: user.id,
          role: 'user',
          content: content.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      // Log event (fire and forget)
      supabase.from('events').insert({
        user_id: user.id,
        trip_id: tripId,
        name: 'message_sent',
        props_json: { role: 'user' },
      });

      return data;
    },
  });
}
