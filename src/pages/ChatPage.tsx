// Chat page — the main SPA page with the chatbot UI.
//
// Uses the @rcrt/sdk to send chat messages and the /api/chat/stream proxy
// for SSE streaming of the assistant's reply.

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth';
import { sendChat, openChatStream } from '../rcrt';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
}

function genSessionId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatPage() {
  const { user, signOut, token, activeTenant, tenants, loadTenants, selectTenant, signupIfEmpty } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sessionId] = useState(genSessionId);
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load tenants on mount.
  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  // Auto-scroll to bottom.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Open SSE stream for the session.
  useEffect(() => {
    if (!token || !activeTenant) return;

    setStreaming(true);
    const close = openChatStream(
      sessionId,
      token,
      activeTenant.id,
      (event) => {
        let payload: {
          delta?: string;
          is_final?: boolean;
          content?: { content?: string; source_type?: string; finish_reason?: string };
          agent_id?: string;
        };
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        // 'delta' events carry incremental assistant text.
        // The platform sends: {"agent_id":"chat","delta":"text...","is_final":true|false}
        if (event.type === 'delta' && payload.delta) {
          const text = payload.delta;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant' && last.pending) {
              last.content += text;
              return [...next];
            }
            return [...next, { role: 'assistant', content: text, pending: true }];
          });
        }

        // 'message' events with source_type "agent" carry the final response.
        // The platform sends: {"content":{"content":"full text","source_type":"agent",...},...}
        if (event.type === 'message' && payload.content?.source_type === 'agent') {
          const text = payload.content.content ?? '';
          if (text) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant' && last.pending) {
                last.content = text;
                last.pending = false;
                return [...next];
              }
              return [...next, { role: 'assistant', content: text, pending: false }];
            });
          }
          setStreaming(false);
        }

        // 'stream.complete' signals the turn is done.
        if (event.type === 'stream.complete') {
          setStreaming(false);
          // If we have a pending assistant message (deltas but no final message),
          // mark it as complete.
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant' && last.pending) {
              last.pending = false;
              return [...next];
            }
            return next;
          });
        }
      },
      () => setStreaming(false),
    );

    return close;
  }, [token, activeTenant, sessionId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    if (!token || !activeTenant) {
      setTenantError('No workspace selected. Select or create one above.');
      return;
    }

    const text = input.trim();
    setInput('');
    setSending(true);
    setTenantError(null);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setStreaming(true);

    try {
      await sendChat(text, sessionId, token, activeTenant.id);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Failed to send message'}`, pending: false },
      ]);
      setStreaming(false);
    } finally {
      setSending(false);
    }
  };

  const noTenant = tenants.length === 0;

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <div className="chat-header-left">
          <span className="brand-mark-sm">RCRT</span>
          <span className="chat-title">RCRT Chat</span>
        </div>
        <div className="chat-header-right">
          {user && (
            <span className="user-pill">
              {user.name ?? user.email ?? 'User'}
            </span>
          )}
          {activeTenant && (
            <select
              className="tenant-select"
              value={activeTenant.id}
              onChange={(e) => {
                const t = tenants.find((t) => t.id === e.target.value);
                if (t) selectTenant(t);
              }}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {noTenant ? (
        <div className="no-tenant">
          <h2>No workspace yet</h2>
          <p>You are signed in, but your account doesn't belong to a workspace yet. Create your first workspace to start chatting.</p>
          {tenantError && <div className="alert alert-error">{tenantError}</div>}
          <button
            className="btn btn-primary"
            onClick={async () => {
              const msg = await signupIfEmpty();
              if (msg.includes('created')) {
                setTenantError(null);
              } else {
                setTenantError(msg);
              }
            }}
          >
            Create workspace
          </button>
        </div>
      ) : !activeTenant ? (
        <div className="no-tenant">
          <h2>Select a workspace</h2>
          <p>Choose a workspace to start chatting.</p>
        </div>
      ) : (
        <main className="chat-main">
          <div className="messages">
            {messages.length === 0 && (
              <div className="empty-chat">
                <p>Send a message to start chatting with the RCRT agent.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`message message-${m.role}`}>
                <div className="message-role">{m.role === 'user' ? 'You' : 'Assistant'}</div>
                <div className="message-content">
                  {m.content}
                  {m.pending && streaming && <span className="cursor">▌</span>}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form className="chat-input-bar" onSubmit={handleSend}>
            <input
              type="text"
              className="chat-input"
              placeholder="Type a message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
            />
            <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        </main>
      )}
    </div>
  );
}
