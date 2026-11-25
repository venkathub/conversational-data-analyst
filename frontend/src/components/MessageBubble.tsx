import type { ChatMessage } from './ChatShell';

interface Props {
  message: ChatMessage;
  onAsk: (question: string) => void;
  busy: boolean;
}

export function MessageBubble({ message }: Props) {
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
        {response?.ok === true && <p>{response.answer}</p>}
        {response?.ok === false && <p className="error-text">{response.error.message}</p>}
      </div>
    </div>
  );
}
