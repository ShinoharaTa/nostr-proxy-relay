import { useEffect, useRef, useState } from 'react';

export interface PollingState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  /** 直近の成功取得時刻 (Date.now()) */
  loadedAt: number | undefined;
  refresh: () => void;
}

/**
 * `fetcher` を `intervalMs` 毎に呼ぶ単純なポーリング。
 * - mount 時に即時 1 回フェッチ
 * - エラーは保持しつつ古いデータを残す (フリッカ防止)
 * - `deps` 変化で fetcher を作り直す。fetcher 自体は毎回新インスタンスを渡しても良いように useRef で安定化
 */
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  deps: ReadonlyArray<unknown> = [],
): PollingState<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<number | undefined>(undefined);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const ctl = new AbortController();
    const run = async () => {
      try {
        const v = await fetcherRef.current(ctl.signal);
        if (!alive) return;
        setData(v);
        setError(undefined);
        setLoadedAt(Date.now());
      } catch (e) {
        if (!alive) return;
        if ((e as Error).name === 'AbortError') return;
        setError(e as Error);
      } finally {
        if (alive) setLoading(false);
      }
    };
    run();
    const id = window.setInterval(run, intervalMs);
    return () => {
      alive = false;
      ctl.abort();
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, tick, ...deps]);

  return { data, error, loading, loadedAt, refresh: () => setTick((n) => n + 1) };
}
