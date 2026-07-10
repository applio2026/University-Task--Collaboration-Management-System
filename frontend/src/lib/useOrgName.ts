import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** The configurable organization name, shown on the login page and sidebar. */
export function useOrgName(): string {
  const { data } = useQuery({
    queryKey: ['config'],
    queryFn: async () => (await api.get('/config')).data.universityName as string,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? 'University';
}
