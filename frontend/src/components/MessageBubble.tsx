import type { ChatMessage } from './ChatShell';
import { ErrorCard } from './ErrorCard';
import { ResultView } from './ResultView';

interface Props {
  message: ChatMessage;
  onAsk: (question: string) => void;
  busy: boolean;
}

export function MessageBubble({ message, onAsk, busy }: Props) {
  if (message.role === 'user') {
    return (
      <div className="row user">
        <div className="bubble user-bubble">{message.text}</div>
      </div>
    );
  }

  const { response } = message;
  return (
    <div className="row assistant">
      <div className="bubble assistant-bubble">
        {!response && (
          <p className="loading" role="status">
            Analysing your question<span className="dots" aria-hidden="true" />
          </p>
        )}
        {response?.ok === true && <ResultView response={response} />}
        {response?.ok === false && <ErrorCard failure={response} question={message.question} busy={busy} onAsk={onAsk} />}
      </div>
    </div>
  );
}
