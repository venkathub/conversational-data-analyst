import { EXAMPLE_QUESTIONS } from '@cda/shared';
import type { ClientFailure } from '../api';
import { presentError } from '../lib/errorUi';

interface Props {
  failure: ClientFailure;
  question: string | undefined;
  busy: boolean;
  onAsk: (question: string) => void;
}

export function ErrorCard({ failure, question, busy, onAsk }: Props) {
  const { error } = failure;
  const view = presentError(error.code);
  const suggestions = error.suggestions ?? [...EXAMPLE_QUESTIONS];

  return (
    <div className="error-card" role="alert">
      <p className="error-title">{view.title}</p>
      <p className="error-message">{error.message}</p>
      {view.canRetry && question && (
        <button type="button" className="retry-btn" onClick={() => onAsk(question)} disabled={busy}>
          Try again
        </button>
      )}
      {view.showSuggestions && (
        <>
          <p className="muted small">Try one of these instead:</p>
          <div className="chips left">
            {suggestions.map((q) => (
              <button key={q} type="button" className="chip" onClick={() => onAsk(q)} disabled={busy}>
                {q}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
