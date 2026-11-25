import { ChatShell } from './components/ChatShell';

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Conversational Data Analyst</h1>
        <p>Ask a question about onboarding, customers, branches or transactions.</p>
      </header>
      <ChatShell />
    </div>
  );
}
