import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: ReactNode;
  /** PC ヘッダ表示のみ (true で sm/md では非表示) */
  hideOnMobile?: boolean;
  /** カード化時の左側ラベル (省略時は label) */
  cardLabel?: ReactNode;
  width?: string | number;
  render: (row: T, index: number) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  emptyTitle?: string;
  emptyHint?: string;
}

/**
 * PC: <table>、tablet/mobile: <Card> 風スタック表示。
 * docs/ui_redesign_ja.md §6.4 のテーブル → カード変換に準拠。
 */
export function DataList<T>({
  columns,
  rows,
  rowKey,
  emptyTitle = 'NO RECORDS',
  emptyHint,
}: Props<T>) {
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
      <table className="crt-list">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)}>
              {columns.map((c) => (
                <td key={c.key}>{c.render(row, i)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="crt-list--cards">
        {rows.map((row, i) => (
          <div className="crt-list__card" key={rowKey(row, i)}>
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
