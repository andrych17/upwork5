// The prices and plan sizes the admin set in Settings. Pages show the defaults first, then swap in the saved ones.
import { useEffect, useState } from 'react';
import { DEFAULT_PLANS, parsePlans, type PlanSet } from '@/lib/prices';
import { getSupabase } from '@/lib/supabase';

let loaded: PlanSet | null = null;

export function usePlans(): PlanSet {
  const [set, setSet] = useState<PlanSet>(loaded ?? DEFAULT_PLANS);
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || loaded) return;
    let live = true;
    void Promise.resolve(supabase.rpc('get_plans')).then(({ data }) => {
      if (!data) return;
      loaded = parsePlans(data);
      if (live) setSet(loaded);
    });
    return () => {
      live = false;
    };
  }, []);
  return set;
}
