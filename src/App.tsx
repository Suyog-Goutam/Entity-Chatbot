import React, { useState, useEffect, useRef } from 'react';
import { Login } from './components/Login';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Trash2 } from 'lucide-react';
import { routeMessage, callSpecialist, MODELS } from './services/ai';
import { getConversations, getMessages, createConversation, addMessageToDb, deleteConversation } from './services/db';
import type { Conversation } from './services/db';
import { ModelInfoModal } from './components/ModelInfoModal';

interface Message {
  id: string;
  role: 'user' | 'entity';
  content: string;
  modelUsed?: string;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [guestMessageCount, setGuestMessageCount] = useState(10);
  const [loading, setLoading] = useState(true);
  
  // New UI States
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isModelInfoOpen, setIsModelInfoOpen] = useState(false);
  const [sessionMessageCount, setSessionMessageCount] = useState(0);
  
  // DB state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsAuthenticated(true);
        setIsGuest(user.isAnonymous);
        
        if (user.isAnonymous) {
          setGuestMessageCount(10);
          setConversations([]);
          setMessages([{ id: 'initial', role: 'entity', content: 'System initialized in GUEST MODE. Secure connection established. You have 10 queries remaining.' }]);
        } else {
          // Load history
          const convs = await getConversations();
          setConversations(convs);
          if (convs.length > 0) {
            loadConversation(convs[0].id);
          } else {
            setMessages([{ id: 'initial', role: 'entity', content: 'System initialized. Secure connection established. How can I assist you?' }]);
          }
        }
      } else {
        setIsAuthenticated(false);
        setIsGuest(false);
        setConversations([]);
        setCurrentConversationId(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loadConversation = async (id: string) => {
    setCurrentConversationId(id);
    const msgs = await getMessages(id);
    if (msgs.length > 0) {
      setMessages(msgs.map(m => ({ id: m.id, role: m.role, content: m.content })));
    } else {
      setMessages([{ id: 'initial', role: 'entity', content: 'System initialized. Secure connection established. How can I assist you?' }]);
    }
  };

  const handleNewChat = () => {
    setCurrentConversationId(null);
    setMessages([{ id: 'initial', role: 'entity', content: 'System initialized. Secure connection established. How can I assist you?' }]);
  };

  const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this chat?')) {
      await deleteConversation(id);
      setConversations(conversations.filter(c => c.id !== id));
      if (currentConversationId === id) {
        handleNewChat();
      }
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
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
    setSessionMessageCount(prev => prev + 1);

    // 1. Database setup
    let convId = currentConversationId;
    if (!convId && !isGuest) {
      convId = await createConversation(userText);
      setCurrentConversationId(convId);
      // Refresh sidebar
      const convs = await getConversations();
      setConversations(convs);
    }

    // 2. Add user message
    const userMsgId = Date.now().toString();
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: userText }]);
    if (!isGuest && convId) {
      await addMessageToDb(convId, 'user', userText);
    }
    
    // Decrement guest count
    if (isGuest) {
      setGuestMessageCount(prev => prev - 1);
    }
    
    try {
      // 3. Routing phase
      setActiveModelId('routing...');
      const category = await routeMessage(userText);
      const specialistModel = MODELS[category];
      setActiveModelId(`${category}: ${specialistModel}`);

      // 4. Specialist response phase
      const entityMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: entityMsgId, role: 'entity', content: '', modelUsed: specialistModel }]);

      let fullResponse = '';
      
      const apiMessages = [...messages, { id: 'temp', role: 'user', content: userText }].map(m => ({
        role: m.role === 'entity' ? 'assistant' : m.role,
        content: m.content
      }));

      await callSpecialist(apiMessages, category, (chunk) => {
        fullResponse += chunk;
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsgIndex = newMessages.length - 1;
          if (newMessages[lastMsgIndex].id === entityMsgId) {
            newMessages[lastMsgIndex] = {
              ...newMessages[lastMsgIndex],
              content: fullResponse
            };
          }
          return newMessages;
        });
      });

      // Save complete entity response to DB
      if (fullResponse && !isGuest && convId) {
        await addMessageToDb(convId, 'entity', fullResponse);
      }

    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'entity', content: '[SYSTEM ERROR: Communication failure.]' }]);
    } finally {
      setIsProcessing(false);
      setActiveModelId('standby');
      
      // Handle guest limit reached
      if (isGuest && guestMessageCount <= 1) {
        setTimeout(() => {
          alert('Guest query limit reached. Terminating session.');
          localStorage.setItem('guest_lockout', (Date.now() + 10 * 60 * 1000).toString());
          handleLogout();
        }, 1000);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-hacker-bg flex items-center justify-center">
        <div className="font-mono text-hacker-accent animate-pulse">Initializing System...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="h-[100dvh] bg-hacker-bg flex flex-col overflow-hidden">
      <header className="border-b border-accent p-4 flex justify-between items-center bg-hacker-panel shrink-0 z-10">
        <h1 className="font-mono text-hacker-text uppercase tracking-widest text-lg flex items-center gap-2">
          <button 
            onClick={() => !isGuest && setIsSidebarOpen(true)}
            className="md:cursor-default"
            title="Open History"
          >
            <img src="/icon.png" alt="Entity" className="w-8 h-8 rounded-md border border-hacker-accent p-1" />
          </button>
          System <span className="text-hacker-accent">Entity</span>
          {isGuest && <span className="ml-2 text-xs bg-hacker-accent/20 text-hacker-accent px-2 py-1 rounded hidden sm:inline-block">GUEST: {guestMessageCount} left</span>}
        </h1>
        <div className="flex gap-2 sm:gap-4 items-center">
          <button 
            onClick={() => setIsModelInfoOpen(true)}
            className="text-[10px] sm:text-xs font-mono text-hacker-muted hover:text-hacker-accent transition-colors uppercase"
          >
            [ Model Info ]
          </button>
          <button 
            onClick={() => {
              if (isGuest) localStorage.setItem('guest_lockout', (Date.now() + 10 * 60 * 1000).toString());
              handleLogout();
            }}
            className="text-[10px] sm:text-xs font-mono text-hacker-muted hover:text-hacker-accent transition-colors uppercase"
          >
            [ Terminate Session ]
          </button>
        </div>
      </header>

      <main className="flex-1 flex p-2 md:p-4 gap-4 overflow-hidden relative">
        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && !isGuest && (
          <div className="md:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setIsSidebarOpen(false)} />
        )}

        {/* Sidebar History */}
        {!isGuest && (
          <div className={`fixed md:relative top-0 left-0 h-[100dvh] md:h-auto z-50 md:z-auto w-64 border border-accent rounded bg-hacker-panel flex flex-col transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
            <div className="p-3 border-b border-accent/50 flex justify-between items-center">
              <span className="text-xs font-mono text-hacker-accent uppercase tracking-wider">Logs // History</span>
              <button onClick={handleNewChat} className="text-hacker-accent hover:text-white transition-colors text-xl leading-none">+</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {conversations.length === 0 ? (
                <div className="text-hacker-muted text-xs font-mono p-2 text-center opacity-50 mt-10">No history found.</div>
              ) : (
                conversations.map(conv => (
                  <div key={conv.id} className={`flex items-center w-full rounded transition-colors ${currentConversationId === conv.id ? 'bg-hacker-accent/20 border border-hacker-accent/30' : 'hover:bg-hacker-bg'}`}>
                    <button
                      onClick={() => {
                        loadConversation(conv.id);
                        setIsSidebarOpen(false);
                      }}
                      className={`flex-1 text-left p-2 text-sm font-sans truncate ${currentConversationId === conv.id ? 'text-hacker-text' : 'text-hacker-muted hover:text-hacker-text'}`}
                    >
                      {conv.title}
                    </button>
                    <button 
                      onClick={(e) => handleDeleteChat(e, conv.id)}
                      className="p-2 text-hacker-muted hover:text-red-500 transition-colors shrink-0 opacity-50 hover:opacity-100"
                      title="Delete chat"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 border border-accent rounded bg-hacker-panel flex flex-col relative overflow-hidden">
          {/* Model Activity Indicator */}
          <div className="absolute top-2 right-2 text-[10px] font-mono text-hacker-accent/70 bg-hacker-accent/10 px-2 py-1 rounded border border-hacker-accent/30 z-10 shadow-sm backdrop-blur-sm">
            [{activeModelId}]
          </div>

          {/* Message List */}
          <div className="flex-1 p-4 overflow-y-auto font-sans text-hacker-text space-y-6 scroll-smooth">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className="flex flex-col max-w-[90%] md:max-w-[80%]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-mono text-xs uppercase tracking-wider ${msg.role === 'user' ? 'text-hacker-muted' : 'text-hacker-accent'}`}>
                      {msg.role === 'user' ? 'User' : 'Entity'} {msg.role === 'entity' && '>'}
                    </span>
                  </div>
                  <div className={`p-3 rounded-lg ${
                    msg.role === 'user' 
                      ? 'bg-hacker-accent/10 border border-hacker-accent/20 text-hacker-text' 
                      : 'bg-transparent text-hacker-text leading-relaxed whitespace-pre-wrap'
                  }`}>
                    {/* Render bold text for highlights properly or let it be raw markdown for now */}
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 md:p-4 border-t border-accent/30 bg-hacker-panel shrink-0">
            <form onSubmit={handleSendMessage} className="relative flex items-center">
              <span className="absolute left-4 font-mono text-hacker-accent hidden md:inline">$&gt;</span>
              <input 
                type="text" 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={isProcessing}
                className="w-full bg-hacker-bg border border-accent/50 rounded-full py-3 pl-4 md:pl-12 pr-12 text-hacker-text font-sans glow-focus transition-all disabled:opacity-50"
                placeholder={isProcessing ? "Processing..." : "Enter command or query..."}
                autoFocus
              />
              {!isProcessing && <div className="absolute right-5 w-2 h-5 bg-hacker-accent animate-blink"></div>}
            </form>
          </div>
        </div>
      </main>

      <ModelInfoModal 
        isOpen={isModelInfoOpen} 
        onClose={() => setIsModelInfoOpen(false)} 
        sessionMessages={sessionMessageCount} 
      />
    </div>
  );
}

export default App;
