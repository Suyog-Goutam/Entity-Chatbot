import React, { useState, useEffect, useRef } from 'react';
import { Login } from './components/Login';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { initAI, routeMessage, callSpecialist, Category, MODELS } from './services/ai';

// 1 hour in milliseconds
const SESSION_DURATION = 60 * 60 * 1000; 

interface Message {
  id: string;
  role: 'user' | 'entity';
  content: string;
  modelUsed?: string;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([
    { id: 'initial', role: 'entity', content: 'System initialized. Secure connection established. How can I assist you?' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeModelId, setActiveModelId] = useState<string>('standby');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Monitor Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && apiKey) {
        setIsAuthenticated(true);
        initAI(apiKey);
      } else if (!user) {
        setIsAuthenticated(false);
        setApiKey(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [apiKey]);

  // Handle 1-hour auto-lock
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (isAuthenticated && apiKey) {
      timeoutId = setTimeout(() => {
        handleLogout();
        alert('Session expired. Please initialize again.');
      }, SESSION_DURATION);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isAuthenticated, apiKey]);

  const handleLoginSuccess = (key: string) => {
    setApiKey(key);
    setIsAuthenticated(true);
    initAI(key);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setApiKey(null);
      setIsAuthenticated(false);
      setMessages([{ id: 'initial', role: 'entity', content: 'System initialized. Secure connection established. How can I assist you?' }]);
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isProcessing) return;

    const userText = inputValue.trim();
    setInputValue('');
    setIsProcessing(true);

    // 1. Add user message
    const userMsgId = Date.now().toString();
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: userText }]);
    
    try {
      // 2. Routing phase
      setActiveModelId('routing...');
      const category = await routeMessage(userText);
      const specialistModel = MODELS[category];
      setActiveModelId(`${category}: ${specialistModel}`);

      // 3. Specialist response phase
      const entityMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: entityMsgId, role: 'entity', content: '', modelUsed: specialistModel }]);

      // We append text to the last message as it streams in
      await callSpecialist(userText, category, (chunk) => {
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsgIndex = newMessages.length - 1;
          if (newMessages[lastMsgIndex].id === entityMsgId) {
            newMessages[lastMsgIndex] = {
              ...newMessages[lastMsgIndex],
              content: newMessages[lastMsgIndex].content + chunk
            };
          }
          return newMessages;
        });
      });

    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'entity', content: '[SYSTEM ERROR: Communication failure.]' }]);
    } finally {
      setIsProcessing(false);
      setActiveModelId('standby');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-hacker-bg flex items-center justify-center">
        <div className="font-mono text-hacker-accent animate-pulse">Initializing System...</div>
      </div>
    );
  }

  if (!isAuthenticated || !apiKey) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-hacker-bg flex flex-col">
      <header className="border-b border-accent p-4 flex justify-between items-center bg-hacker-panel">
        <h1 className="font-mono text-hacker-text uppercase tracking-widest text-lg">
          System <span className="text-hacker-accent">Entity</span>
        </h1>
        <button 
          onClick={handleLogout}
          className="text-xs font-mono text-hacker-muted hover:text-hacker-accent transition-colors uppercase"
        >
          [ Terminate Session ]
        </button>
      </header>

      <main className="flex-1 flex p-4 gap-4 overflow-hidden">
        <div className="w-64 border border-accent rounded bg-hacker-panel hidden md:flex flex-col">
          <div className="p-2 border-b border-accent/50 text-xs font-mono text-hacker-accent uppercase tracking-wider">
            Logs // History
          </div>
          <div className="flex-1 p-2 text-hacker-muted text-sm font-code flex items-center justify-center text-center opacity-50">
            History sync offline.<br/>(Firestore integration pending)
          </div>
        </div>

        <div className="flex-1 border border-accent rounded bg-hacker-panel flex flex-col relative overflow-hidden">
          {/* Model Activity Indicator */}
          <div className="absolute top-2 right-2 text-[10px] font-mono text-hacker-accent/70 bg-hacker-accent/10 px-2 py-1 rounded border border-hacker-accent/30 z-10 shadow-sm backdrop-blur-sm">
            [{activeModelId}]
          </div>

          {/* Message List */}
          <div className="flex-1 p-4 overflow-y-auto font-sans text-hacker-text space-y-6 scroll-smooth">
            {messages.map((msg) => (
              <div key={msg.id} className={\`flex flex-col \${msg.role === 'user' ? 'items-end' : 'items-start'}\`}>
                <div className="flex flex-col max-w-[85%]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={\`font-mono text-xs uppercase tracking-wider \${msg.role === 'user' ? 'text-hacker-muted' : 'text-hacker-accent'}\`}>
                      {msg.role === 'user' ? 'User' : 'Entity'} {msg.role === 'entity' && '>'}
                    </span>
                  </div>
                  <div className={\`p-3 rounded-lg \${msg.role === 'user' ? 'bg-hacker-accent/10 border border-hacker-accent/20 text-hacker-text' : 'bg-transparent text-hacker-text leading-relaxed whitespace-pre-wrap'}\`}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-accent/30 bg-hacker-panel">
            <form onSubmit={handleSendMessage} className="relative flex items-center">
              <span className="absolute left-4 font-mono text-hacker-accent">$&gt;</span>
              <input 
                type="text" 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={isProcessing}
                className="w-full bg-hacker-bg border border-accent/50 rounded-full py-3 pl-12 pr-12 text-hacker-text font-sans focus:glow-focus transition-all disabled:opacity-50"
                placeholder={isProcessing ? "Processing..." : "Enter command or query..."}
                autoFocus
              />
              {!isProcessing && <div className="absolute right-5 w-2 h-5 bg-hacker-accent animate-blink"></div>}
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
