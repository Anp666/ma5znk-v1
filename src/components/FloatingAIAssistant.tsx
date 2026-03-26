import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2, BarChart2, X, MessageSquare, ChevronDown, Maximize2, Minimize2, TrendingUp, Package, Wallet } from 'lucide-react';
import { generateFinancialResponse, financialTools } from '../services/gemini';
import { translations } from '../translations';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { getCollection } from '../services/accountingService';
import { Invoice } from '../types';
import toast from 'react-hot-toast';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

interface Message {
  role: 'user' | 'assistant' | 'model';
  content: string;
  chartData?: any;
}

interface Props {
  lang: 'ar' | 'en';
  profile: any;
}

export default function FloatingAIAssistant({ lang, profile }: Props) {
  const t = translations[lang];
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: lang === 'ar' ? 'مرحباً! أنا مساعدك المالي الذكي. كيف يمكنني مساعدتك اليوم؟' : 'Hello! I am your AI financial assistant. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const executeTool = async (call: any) => {
    const { name, args } = call;
    try {
      switch (name) {
        case 'get_inventory_data': {
          let products = getCollection('products');
          if (args.filter === 'low_stock') {
            products = products.filter((p: any) => p.quantity <= (p.minStock || 5));
          }
          return products;
        }
        case 'get_sales_data': {
          let invoices = getCollection('invoices');
          if (args.period && args.period !== 'all') {
            const now = new Date();
            let startDate = new Date();
            if (args.period === 'today') startDate.setHours(0, 0, 0, 0);
            if (args.period === 'this_week') startDate.setDate(now.getDate() - 7);
            if (args.period === 'this_month') startDate.setMonth(now.getMonth() - 1);
            invoices = invoices.filter((inv: any) => new Date(inv.date) >= startDate);
          }
          return invoices;
        }
        case 'get_treasury_data': {
          const transactions = getCollection('transactions');
          return transactions.slice(0, args.limit || 20);
        }
        case 'get_reports_summary': {
          const invoices = getCollection<Invoice>('invoices');
          const sales = invoices.filter((inv: Invoice) => inv.type === 'sales').reduce((sum: number, inv: Invoice) => sum + inv.total, 0);
          const purchases = invoices.filter((inv: Invoice) => inv.type === 'purchase').reduce((sum: number, inv: Invoice) => sum + inv.total, 0);
          return { totalSales: sales, totalPurchases: purchases, estimatedProfit: sales - purchases };
        }
        default: return { error: 'Tool not found' };
      }
    } catch (error) {
      return { error: 'Failed to fetch data' };
    }
  };

  const handleSend = async (overrideInput?: string) => {
    const messageToSend = overrideInput || input;
    if (!messageToSend.trim() || isLoading) return;

    const userMessage = messageToSend.trim();
    setInput('');
    const newMessages: any[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      let currentMessages: any[] = newMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : m.role,
        parts: [{ text: m.content }]
      }));

      let response = await generateFinancialResponse(currentMessages, financialTools);
      
      while (response.functionCalls) {
        const toolResponses = [];
        for (const call of response.functionCalls) {
          const result = await executeTool(call);
          toolResponses.push({
            functionResponse: { name: call.name, response: { result } }
          });
        }
        if (response.candidates?.[0]?.content?.parts) {
          currentMessages.push({ role: 'model', parts: response.candidates[0].content.parts });
        }
        currentMessages.push({ role: 'user', parts: toolResponses });
        response = await generateFinancialResponse(currentMessages, financialTools);
      }

      let finalContent = response.text || '';
      let chartData = null;
      const chartMatch = finalContent.match(/CHART_DATA:\s*(\[.*\])/s);
      if (chartMatch) {
        try {
          chartData = JSON.parse(chartMatch[1]);
          finalContent = finalContent.replace(/CHART_DATA:\s*\[.*\]/s, '').trim();
        } catch (e) {}
      }
      setMessages(prev => [...prev, { role: 'assistant', content: finalContent, chartData }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: lang === 'ar' ? 'عذراً، حدث خطأ.' : 'Sorry, an error occurred.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const suggestedActions = [
    { id: 'sales_today', label: lang === 'ar' ? 'عرض مبيعات اليوم' : 'View Today\'s Sales', icon: TrendingUp },
    { id: 'top_products', label: lang === 'ar' ? 'أعلى المنتجات مبيعًا' : 'Top Selling Products', icon: Package },
    { id: 'treasury_balance', label: lang === 'ar' ? 'رصيد الخزينة الحالي' : 'Current Treasury Balance', icon: Wallet },
  ];

  return (
    <div className={`fixed bottom-6 ${lang === 'ar' ? 'left-6' : 'right-6'} z-[100]`}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className={`
              bg-[var(--color-bg-light)] dark:bg-[var(--color-bg-dark)] border border-[var(--color-border-light)] dark:border-[var(--color-border-dark)] shadow-2xl rounded-[2rem] overflow-hidden flex flex-col
              ${isMinimized ? 'h-16 w-64' : 'h-[550px] w-[350px] sm:w-[380px]'}
              fixed bottom-24 ${lang === 'ar' ? 'left-6' : 'right-6'}
              max-sm:fixed max-sm:inset-0 max-sm:w-full max-sm:h-full max-sm:rounded-none
            `}
          >
            {/* Header */}
            <div className="p-4 bg-[var(--color-primary)] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold text-sm block leading-none">{lang === 'ar' ? 'المساعد المالي' : 'Financial Assistant'}</span>
                  <span className="text-[10px] opacity-80">{lang === 'ar' ? 'متصل الآن' : 'Online'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsMinimized(!isMinimized)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                  {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                </button>
                <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar" ref={scrollRef}>
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                        msg.role === 'user' 
                          ? 'bg-[var(--color-primary)] text-white rounded-tr-none' 
                          : 'bg-[var(--color-card-light)] dark:bg-[var(--color-card-dark)] text-[var(--color-text-primary-light)] dark:text-[var(--color-text-primary-dark)] border border-[var(--color-border-light)] dark:border-[var(--color-border-dark)] rounded-tl-none'
                      }`}>
                        <div className="prose dark:prose-invert prose-sm max-w-none">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                        {msg.chartData && (
                          <div className="mt-4 h-32 w-full bg-white dark:bg-zinc-900 rounded-xl p-2 border border-zinc-200 dark:border-zinc-700">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={msg.chartData}>
                                <Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="p-3 bg-[var(--color-card-light)] dark:bg-[var(--color-card-dark)] rounded-2xl animate-pulse">
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Suggested Actions */}
                {messages.length === 1 && !isLoading && (
                  <div className="px-4 pb-2 flex flex-wrap gap-2">
                    {suggestedActions.map((action) => (
                      <button
                        key={action.id}
                        onClick={() => handleSend(action.label)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-card-light)] dark:bg-[var(--color-card-dark)] border border-[var(--color-border-light)] dark:border-[var(--color-border-dark)] rounded-full text-xs font-medium hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-all"
                      >
                        <action.icon className="w-3 h-3" />
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Input */}
                <div className="p-4 border-t border-[var(--color-border-light)] dark:border-[var(--color-border-dark)]">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={lang === 'ar' ? 'اسألني أي شيء...' : 'Ask me anything...'}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      className="w-full pl-4 pr-12 py-3 bg-[var(--color-card-light)] dark:bg-[var(--color-card-dark)] border border-[var(--color-border-light)] dark:border-[var(--color-border-dark)] rounded-xl text-sm focus:ring-2 ring-[var(--color-primary)]/20 outline-none"
                    />
                    <button 
                      onClick={() => handleSend()}
                      disabled={isLoading}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-[var(--color-primary)] text-white rounded-lg flex items-center justify-center disabled:opacity-50 hover:bg-[var(--color-primary-hover)] transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-[var(--color-primary)] text-white rounded-full flex items-center justify-center shadow-2xl shadow-[var(--color-primary)]/40"
      >
        {isOpen ? <ChevronDown className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </motion.button>
    </div>
  );
}
