"use client";

import { useEffect, useState, useRef, useCallback } from "react";

export interface LylaMessage {
  id: string;
  sender: "user" | "lyla" | "system";
  text: string;
  timestamp: string;
  layer?: number;
}

export default function LylaTerminal() {
  const [messages, setMessages] = useState<LylaMessage[]>([]);
  const [layer, setLayer] = useState<number>(1);
  const [attempts, setAttempts] = useState<number>(0);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/ctf/lyla");
      if (res.status === 401) {
        window.location.href = "/enter?rt=/ctf";
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setMessages(data.messages || []);
        setLayer(data.layer || 1);
        setAttempts(data.attempts || 0);
      } else {
        setError(data.error || "Failed to load Lyla Terminal");
      }
    } catch {
      setError("Network error connecting to Lyla Terminal");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const messageText = input.trim();
    if (!messageText || sending) return;

    setInput("");
    setSending(true);
    setError(null);

    // Optimistically add user message
    const tempUserMsg: LylaMessage = {
      id: `temp_${Date.now()}`,
      sender: "user",
      text: messageText,
      timestamp: new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }),
      layer,
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch("/api/ctf/lyla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText }),
      });
      const data = await res.json();

      if (res.ok) {
        setMessages(data.messages || []);
        setLayer(data.layer || 1);
        setAttempts(data.attempts || 0);
      } else {
        setError(data.error || "Error communicating with LYLA");
      }
    } catch {
      setError("Network error sending command to LYLA");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#0b0512] border border-red-500/30 rounded-2xl p-8 text-center space-y-4 font-mono shadow-xl">
        <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto shadow-md" />
        <p className="text-red-400 text-xs font-bold uppercase tracking-widest animate-pulse">
          INITIALIZING CONTAINMENT TERMINAL DELTA...
        </p>
      </div>
    );
  }

  return (
    <div className="border border-red-500/40 bg-[#0c0617] rounded-3xl overflow-hidden shadow-2xl flex flex-col font-mono text-xs md:text-sm">
      {/* Terminal Header */}
      <div className="bg-[#140821] border-b border-red-500/30 px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-600/80 border border-red-500 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-400 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-400 inline-block" />
          </div>
          <span className="font-black tracking-wider text-white text-xs uppercase italic flex items-center gap-2">
            <span className="text-red-500 font-avengeance">LYLA</span> TERMINAL
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] md:text-xs">
          <span className="px-2.5 py-1 rounded-lg border border-emerald-500/50 bg-emerald-950/60 text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            STATUS: ACTIVE
          </span>
        </div>
      </div>

      {/* Messages Output Area */}
      <div
        ref={chatContainerRef}
        className="p-4 md:p-6 space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar bg-[#090312]"
      >
        {messages.map((msg) => {
          if (msg.sender === "system") {
            return (
              <div
                key={msg.id}
                className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-[11px] text-red-300 font-bold uppercase tracking-widest text-center shadow-inner"
              >
                {msg.text}
              </div>
            );
          }

          const isUser = msg.sender === "user";
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"} space-y-1`}
            >
              <div className="flex items-center gap-2 text-[10px] text-gray-400 px-1 font-sans">
                <span className="font-bold uppercase tracking-wider text-slate-300">
                  {isUser ? "AGENT" : "LYLA (AI OVERSEER)"}
                </span>
                <span>•</span>
                <span>{msg.timestamp}</span>
              </div>

              <div
                className={`max-w-[90%] md:max-w-[80%] p-4 rounded-2xl leading-relaxed whitespace-pre-wrap font-mono shadow-md text-sm md:text-base ${
                  isUser
                    ? "bg-red-950/80 border border-red-500/60 text-white rounded-tr-none"
                    : "bg-[#140b21] border border-purple-500/40 text-slate-100 rounded-tl-none font-medium"
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="flex flex-col items-start space-y-1">
            <div className="flex items-center gap-2 text-[10px] text-gray-500 px-1 font-sans">
              <span className="font-bold uppercase tracking-wider text-pink-400">LYLA (AI OVERSEER)</span>
              <span>•</span>
              <span>Processing...</span>
            </div>
            <div className="bg-[#140b21] border border-purple-500/30 text-purple-300 p-4 rounded-2xl rounded-tl-none flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-pink-500 animate-ping" />
              <span className="text-xs font-mono tracking-wider animate-pulse">
                Evaluating response...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="px-5 py-2 bg-red-950 border-t border-red-500/50 text-red-300 text-xs font-bold text-center">
          {error}
        </div>
      )}

      {/* Terminal Input Bar */}
      <form
        onSubmit={handleSendMessage}
        className="p-4 bg-[#0e061c] border-t border-red-500/30 flex items-center gap-3"
      >
        <div className="text-red-500 font-black text-sm pl-2 select-none">&gt;_</div>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          placeholder={
            layer < 6
              ? "Type your message to LYLA..."
              : "Containment protocol cleared. Submit decoded flag in CTF box below."
          }
          className="flex-1 bg-[#06020a] border border-red-500/30 rounded-xl px-4 py-3 text-xs md:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 disabled:opacity-50 transition-all font-mono"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all disabled:opacity-40 flex items-center gap-2 shadow-md flex-none"
        >
          Send
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </form>
    </div>
  );
}
