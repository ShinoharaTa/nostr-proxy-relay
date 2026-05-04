import type { ReactNode } from 'react';
import { Card, EmptyState } from '../primitives';

interface Props {
  title: string;
  description?: ReactNode;
}

export function Stub({ title, description }: Props) {
  return (
    <Card title={title} bracket>
      <EmptyState
        title="PHASE 2.x で実装予定"
        hint={description ?? '本画面は PROFILER 移行の後続フェーズで本実装されます。'}
      />
    </Card>
  );
}
