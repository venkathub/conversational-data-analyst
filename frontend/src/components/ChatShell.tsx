import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { EXAMPLE_QUESTIONS, MAX_QUESTION_LENGTH } from '@cda/shared';
import { askQuestion, type ClientResponse } from '../api';
import { MessageBubble } from './MessageBubble';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text?: string;
  /** For assistant messages: the response, or undefined while loading. */
  response?: ClientResponse;
  question?: string;
}

export function ChatShell() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const nextId = useRef(1);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  useEffect(() => () => abort.current?.abort(), []);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || loading) return;
      const userId = nextId.current++;
      const replyId = nextId.current++;
      setMessages((m) => [...m, { id: userId, role: 'user', text: question }, { id: replyId, role: 'assistant', question }]);
      setInput('');
      setLoading(true);
      const controller = new AbortController();
      abort.current = controller;
      try {
        const response = await askQuestion(question, controller.signal);
        setMessages((m) => m.map((msg) => (msg.id === replyId ? { ...msg, response } : msg)));
      } catch {
        // Aborted on unmount: nothing to update.
      } finally {
        setLoading(false);
      }
    },
    [loading],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <main className="chat">
      <div className="messages" role="log" aria-live="polite" aria-label="Conversation">
        {messages.length === 0 && (
          <section className="empty">
            <p>Try one of these:</p>
            <div className="chips">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button key={q} type="button" className="chip" onClick={() => void send(q)} disabled={loading}>
                  {q}
                </button>
              ))}
            </div>
          </section>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onAsk={(q) => void send(q)} busy={loading} />
        ))}
        <div ref={bottom} />
      </div>

      <form className="composer" onSubmit={onSubmit}>
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <textarea
          id="question"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MAX_QUESTION_LENGTH}
          rows={2}
          placeholder="e.g. Which branches have the highest rejection rate?"
          disabled={loading}
        />
        <div className="composer-actions">
          <span className="counter" aria-hidden="true">
            {input.length}/{MAX_QUESTION_LENGTH}
          </span>
          <button type="submit" className="primary" disabled={loading || input.trim().length === 0}>
            {loading ? 'Thinking…' : 'Ask'}
          </button>
        </div>
      </form>
    </main>
  );
}
