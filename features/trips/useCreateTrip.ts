import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Trip } from '@/types';

const ONBOARDING_MESSAGE =
  '¡Hola! Soy tu asistente de viaje. Cuéntame sobre este viaje: ¿a dónde van, cuándo, con quién y qué quieren hacer? Puedes contarme todo en lenguaje natural.';

type CreateTripInput = {
  title?: string;
  destination?: string;
  start_date?: string;
  end_date?: string;
};

export function useCreateTrip() {
  const queryClient = useQueryClient();

  return useMutation<Trip, Error, CreateTripInput>({
    mutationFn: async (input) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      // 1. Create trip
      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .insert({
          user_id: user.id,
          title: input.title || 'Nuevo viaje',
          destination: input.destination ?? null,
          start_date: input.start_date ?? null,
          end_date: input.end_date ?? null,
          status: 'draft',
          planning_mode: 'hybrid',
        })
        .select()
        .single();

      if (tripError) throw tripError;

      // 2. Insert onboarding message from assistant
      await supabase.from('messages').insert({
        trip_id: trip.id,
        user_id: user.id,
        role: 'assistant',
        content: ONBOARDING_MESSAGE,
      });

      // 3. Log event
      await supabase.from('events').insert({
        user_id: user.id,
        trip_id: trip.id,
        name: 'trip_created',
        props_json: { destination: input.destination ?? null },
      });

      return trip;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}
