import { useEffect, useRef, useState } from "react";
import {
  fitbitService,
  SleepLog,
  DailyHealth,
  SyncStatus,
} from "../../../services/fitbit";

interface FitbitHealthData {
  days: string;
  setDays: (d: string) => void;
  allSleep: SleepLog[];
  allDaily: DailyHealth[];
  syncStatus: SyncStatus | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
  autoSyncing: boolean;
  tablesOpen: boolean;
  setTablesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  syncData: () => Promise<void>;
}

export function useFitbitHealthData(
  fitbitConnected: boolean,
): FitbitHealthData {
  const [days, setDays] = useState("30");
  const [allSleep, setAllSleep] = useState<SleepLog[]>([]);
  const [allDaily, setAllDaily] = useState<DailyHealth[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [tablesOpen, setTablesOpen] = useState(false);

  // Distinguishes mount (first run) from period changes
  const isFirstLoad = useRef(true);

  const fetchData = async (d: number): Promise<SyncStatus> => {
    // Double the period for KPI comparison (current vs previous); for large
    // periods (>= 365) there is no meaningful "previous" so fetch as-is.
    const extDays = d < 365 ? d * 2 : d;
    const [s, h, status] = await Promise.all([
      fitbitService.getSleep(extDays),
      fitbitService.getDaily(extDays),
      fitbitService.getSyncStatus(),
    ]);
    setAllSleep(s);
    setAllDaily(h);
    setSyncStatus(status);
    return status;
  };

  useEffect(() => {
    if (!fitbitConnected) return;

    const d = Number(days);
    const firstLoad = isFirstLoad.current;
    isFirstLoad.current = false;

    const run = async (): Promise<void> => {
      setLoading(true);
      setError(false);
      let status;
      try {
        status = await fetchData(d);
      } catch {
        setError(true);
        setLoading(false);
        return;
      }
      setLoading(false); // show cached data immediately

      // On first page visit: incremental sync in the background.
      // _determine_sync_range ensures only the delta is fetched from Fitbit.
      if (firstLoad && status.has_data) {
        setAutoSyncing(true);
        try {
          await fitbitService.sync();
          await fetchData(d);
        } catch {
          // silent — stale data already visible
        } finally {
          setAutoSyncing(false);
        }
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, fitbitConnected, reloadKey]);

  const reload = (): void => setReloadKey((k) => k + 1);

  const syncData = async (): Promise<void> => {
    const d = Number(days);
    // Manual sync forces a full re-fetch so days stored incomplete earlier
    // (late-arriving Fitbit data) get corrected, not just the recent delta.
    await fitbitService.sync(true);
    await fetchData(d);
  };

  return {
    days,
    setDays,
    allSleep,
    allDaily,
    syncStatus,
    loading,
    error,
    reload,
    autoSyncing,
    tablesOpen,
    setTablesOpen,
    syncData,
  };
}
