import { useState } from 'react';
import { Card, Button, useToast } from '../primitives';
import { useI18n } from '../i18n';

export interface QuickAction {
  id: string;
  label: string;
  variant: 'primary' | 'ghost' | 'danger';
}

interface Props {
  title: string;
  placeholder: string;
  actions: QuickAction[];
  /** 1 件分の値として妥当か（npub1… / IP・CIDR の形式チェック） */
  isValid: (value: string) => boolean;
  /** 登録本体。確認ダイアログを出す場合もここで行い、中止したら false を返す */
  onSubmit: (values: string[], actionId: string, memo: string) => Promise<boolean>;
}

/** 空白・改行・カンマ区切りで貼られた値を分解し、重複を除く。 */
export function splitValues(input: string): string[] {
  return [...new Set(input.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
}

/**
 * ブロック画面のクイック登録欄（#50）。
 * 入力して種別ボタンを押すだけで登録できるようにし、ADD → ドロワー → mode 選択の多段操作をなくす。
 */
export function QuickRegister({ title, placeholder, actions, isValid, onSubmit }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const [input, setInput] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);

  const values = splitValues(input);
  const invalid = values.filter((v) => !isValid(v));

  const run = async (actionId: string) => {
    if (values.length === 0) return;
    if (invalid.length > 0) {
      toast.push({ variant: 'alert', message: t.block.quickInvalid(invalid.length, invalid[0]) });
      return;
    }
    setBusy(true);
    try {
      if (await onSubmit(values, actionId, memo)) {
        setInput('');
        setMemo('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={<>{title} {values.length > 0 && <span className="crt-hud-tag">{values.length}</span>}</>}>
      <div className="quick-register">
        <textarea
          className="crt-input quick-register__input"
          rows={2}
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label={title}
        />
        <input
          className="crt-input quick-register__memo"
          placeholder={t.block.quickMemo}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
        <div className="quick-register__actions">
          {actions.map((a) => (
            <Button
              key={a.id}
              variant={a.variant}
              disabled={busy || values.length === 0}
              onClick={() => run(a.id)}
            >
              {a.label}
            </Button>
          ))}
        </div>
        {invalid.length > 0 && (
          <p className="quick-register__error">{t.block.quickInvalid(invalid.length, invalid[0])}</p>
        )}
      </div>
    </Card>
  );
}

/** 一括登録の結果をまとめてトーストに出す。 */
export async function applyAll(
  values: string[],
  apply: (value: string) => Promise<void>,
): Promise<{ ok: number; failed: string[] }> {
  let ok = 0;
  const failed: string[] = [];
  for (const v of values) {
    try {
      await apply(v);
      ok += 1;
    } catch {
      failed.push(v);
    }
  }
  return { ok, failed };
}
