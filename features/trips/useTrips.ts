import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Trip } from '@/types';

export function useTrips() {
  return useQuery<Trip[]>({
    queryKey: ['trips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
}
