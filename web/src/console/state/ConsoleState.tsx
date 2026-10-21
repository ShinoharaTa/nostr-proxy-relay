/**
 * 画面をまたいで共有する状態（#54）。
 *
 * - 受信箱: ナビのバッジとホームで同じデータを使うため 1 か所でポーリングする
 * - ライブ: SSE を 1 本だけ張り、ライブ画面とナビの「未読の拒否」の点で共有する
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Inbox, parseLiveEvent } from '../api';
import type { InboxItem, LiveEvent } from '../api';
import { MODERATION_CHANGED } from '../moderation/actions';

const INBOX_POLL_MS = 15_000;
const LIVE_BUFFER = 500;

interface InboxState {
  items: InboxItem[];
  loaded: boolean;
  refresh: () => void;
  /** 一覧から即座に消す（API の結果を待たずに次の項目へ進むため） */
  hide: (key: string) => void;
}

interface LiveState {
  events: LiveEvent[];
  conn: 'connecting' | 'live' | 'disconnected';
  /** 最後にライブ画面を見てから届いた拒否の件数 */
  unseenRejections: number;
  markSeen: () => void;
  /** 表示中はこれを true にしてバッジを数えない */
  setViewing: (v: boolean) => void;
  clear: () => void;
}

const InboxCtx = createContext<InboxState | null>(null);
const LiveCtx = createContext<LiveState | null>(null);

export function useInbox(): InboxState {
  const v = useContext(InboxCtx);
  if (!v) throw new Error('useInbox must be used inside <ConsoleStateProvider>');
  return v;
}

export function useLive(): LiveState {
  const v = useContext(LiveCtx);
  if (!v) throw new Error('useLive must be used inside <ConsoleStateProvider>');
  return v;
}

export const isRejection = (e: LiveEvent) => /reject|drop/.test(e.kind ?? '');

export function ConsoleStateProvider({ children }: { children: ReactNode }) {
  /* ── 受信箱 ── */
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    Inbox.list()
      .then((r) => { setItems(r.items); setHidden(new Set()); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, INBOX_POLL_MS);
    // 措置の直後は少し待ってから取り直す（サーバー側の反映待ち）
    const onChanged = () => window.setTimeout(refresh, 300);
    window.addEventListener(MODERATION_CHANGED, onChanged);
    return () => { window.clearInterval(id); window.removeEventListener(MODERATION_CHANGED, onChanged); };
  }, [refresh]);

  const hide = useCallback((key: string) => setHidden((prev) => new Set(prev).add(key)), []);
  const visibleItems = useMemo(() => items.filter((i) => !hidden.has(i.key)), [items, hidden]);
  const inbox = useMemo(() => ({ items: visibleItems, loaded, refresh, hide }), [visibleItems, loaded, refresh, hide]);

  /* ── ライブ ── */
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [conn, setConn] = useState<LiveState['conn']>('connecting');
  const [unseen, setUnseen] = useState(0);
  const viewingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const es = new EventSource('/api/events/stream');
    es.onopen = () => { if (alive) setConn('live'); };
    es.onerror = () => { if (alive) setConn('disconnected'); };
    es.onmessage = (msg) => {
      try {
        const ev = parseLiveEvent(msg.data);
        setEvents((prev) => {
          const next = [ev, ...prev];
          if (next.length > LIVE_BUFFER) next.length = LIVE_BUFFER;
          return next;
        });
        if (!viewingRef.current && isRejection(ev)) setUnseen((n) => n + 1);
      } catch {
        /* 壊れたメッセージは捨てる */
      }
    };
    return () => { alive = false; es.close(); };
  }, []);

  const markSeen = useCallback(() => setUnseen(0), []);
  const setViewing = useCallback((v: boolean) => { viewingRef.current = v; if (v) setUnseen(0); }, []);
  const clear = useCallback(() => setEvents([]), []);
  const live = useMemo(
    () => ({ events, conn, unseenRejections: unseen, markSeen, setViewing, clear }),
    [events, conn, unseen, markSeen, setViewing, clear],
  );

  return (
    <InboxCtx.Provider value={inbox}>
      <LiveCtx.Provider value={live}>{children}</LiveCtx.Provider>
    </InboxCtx.Provider>
  );
}
