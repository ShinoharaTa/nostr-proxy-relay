import { useMemo, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: ReactNode;
  /** PC ヘッダ表示のみ (true で sm/md では非表示) */
  hideOnMobile?: boolean;
  /** カード化時の左側ラベル (省略時は label) */
  cardLabel?: ReactNode;
  width?: string | number;
  render: (row: T, index: number) => ReactNode;
  /**
   * 指定するとヘッダクリックでソート可能になる (docs/ui_redesign_ja.md §14.2)。
   * number は数値比較、string はロケール比較。
   */
  sortValue?: (row: T) => number | string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  emptyTitle?: string;
  emptyHint?: string;
  /** 行クリックで発火 (アクターインスペクタ起動などに使う) */
  onRowClick?: (row: T) => void;
  /** クライアントサイドの絞り込みバーを出す */
  filter?: {
    placeholder?: string;
    match: (row: T, query: string) => boolean;
  };
  /** 初期ソート (key は columns の key、sortValue 必須) */
  initialSort?: { key: string; dir: 'asc' | 'desc' };
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

/**
 * PC: <table>、tablet/mobile: <Card> 風スタック表示。
 * docs/ui_redesign_ja.md §6.4 のテーブル → カード変換に準拠。
 * §14.2 でヘッダソートとフィルタバーを追加。
 */
export function DataList<T>({
  columns,
  rows,
  rowKey,
  emptyTitle = 'NO RECORDS',
  emptyHint,
  onRowClick,
  filter,
  initialSort,
}: Props<T>) {
  const [sort, setSort] = useState<SortState>(initialSort ?? null);
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    let list = rows;
    const q = query.trim().toLowerCase();
    if (filter && q) list = list.filter((r) => filter.match(r, q));
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sortValue) {
        const sv = col.sortValue;
        const mul = sort.dir === 'asc' ? 1 : -1;
        list = [...list].sort((a, b) => {
          const va = sv(a);
          const vb = sv(b);
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
          return String(va).localeCompare(String(vb)) * mul;
        });
      }
    }
    return list;
  }, [rows, columns, sort, query, filter]);

  const toggleSort = (key: string) => {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' },
    );
  };

  const filterBar = filter && (
    <div className="crt-list__filter">
      <input
        className="crt-input"
        placeholder={filter.placeholder ?? 'filter…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="filter rows"
      />
      {query && (
        <span className="crt-hud-tag">{visible.length} / {rows.length}</span>
      )}
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="crt-empty">
        <div className="crt-empty__title">{emptyTitle}</div>
        {emptyHint && <div>{emptyHint}</div>}
      </div>
    );
  }

  return (
    <>
      {filterBar}
      <table className="crt-list">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width }}>
                {c.sortValue ? (
                  <button
                    type="button"
                    className="crt-list__sort"
                    onClick={() => toggleSort(c.key)}
                    aria-label={`sort by ${c.key}`}
                  >
                    {c.label}
                    <span className="crt-list__sort-mark">
                      {sort?.key === c.key ? (sort.dir === 'desc' ? '▼' : '▲') : '↕'}
                    </span>
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((c) => (
                <td key={c.key}>{c.render(row, i)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="crt-list--cards">
        {visible.map((row, i) => (
          <div
            className="crt-list__card"
            key={rowKey(row, i)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {columns.map((c) => (
              <div className="crt-list__row" key={c.key}>
                <strong>{c.cardLabel ?? c.label}</strong>
                <span>{c.render(row, i)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
