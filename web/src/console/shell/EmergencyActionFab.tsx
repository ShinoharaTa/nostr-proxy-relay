import { useState } from 'react';
import { Drawer } from '../primitives/Drawer';
import { Button } from '../primitives/Button';
import { Icon } from '../icons/Icon';

interface Action {
  id: string;
  label: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
}

interface Props {
  actions?: Action[];
}

const DEFAULT_ACTIONS: Action[] = [
  { id: 'pause-post', label: 'Pause new events',          variant: 'danger', onConfirm: () => alert('paused (stub)') },
  { id: 'detach',     label: 'Detach all backend relays', variant: 'danger', onConfirm: () => alert('detached (stub)') },
  { id: 'flush',      label: 'Flush pending queue',                          onConfirm: () => alert('flushed (stub)') },
];

export function EmergencyActionFab({ actions = DEFAULT_ACTIONS }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="crt-fab"
        aria-label="emergency actions"
        onClick={() => setOpen(true)}
        title="Emergency actions"
      >
        <Icon name="disconnect" size={20} />
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Emergency actions">
        <div style={{ display: 'grid', gap: 10 }}>
          {actions.map((a) => (
            <Button
              key={a.id}
              variant={a.variant === 'danger' ? 'danger' : 'default'}
              onClick={() => {
                if (a.variant === 'danger') {
                  if (!confirm(`${a.label} を実行しますか？`)) return;
                }
                a.onConfirm();
                setOpen(false);
              }}
            >
              {a.label}
            </Button>
          ))}
        </div>
      </Drawer>
    </>
  );
}
