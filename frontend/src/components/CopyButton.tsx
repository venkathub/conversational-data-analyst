import { useEffect, useRef, useState } from 'react';
import { copyToClipboard } from '../lib/copy';

type State = 'idle' | 'copied' | 'failed';

export function CopyButton({ label, getText }: { label: string; getText: () => string }) {
  const [state, setState] = useState<State>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async () => {
    const ok = await copyToClipboard(getText());
    setState(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1800);
  };

  return (
    <button type="button" className="copy-btn" onClick={() => void onClick()}>
      {state === 'copied' ? 'Copied ✓' : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}
