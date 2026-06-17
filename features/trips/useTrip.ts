import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Trip } from '@/types';

export function useTrip(id: string) {
  return useQuery<Trip>({
    queryKey: ['trips', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}
