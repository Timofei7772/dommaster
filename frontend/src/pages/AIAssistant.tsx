import { useState, useRef, useEffect } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { Bot, Send, Sparkles, Lightbulb, Search, FileText, Camera, MapPin, Calculator, Settings, Key, AlertTriangle, CheckCircle } from 'lucide-react'
import { aiApi, ChatMessage } from '@/lib/api'
import { cn } from '@/lib/utils'

const suggestions = [
  { icon: Search, text: 'Найди расценку на штукатурку стен' },
  { icon: Lightbulb, text: 'Что такое накладные расходы?' },
  { icon: FileText, text: 'Как рассчитать КС-2?' },
  { icon: Calculator, text: 'Посчитай 15% накладных от 500000' },
  { icon: MapPin, text: 'Цены на ремонт в Москве vs регионах' },
  { icon: Search, text: 'Расценка на укладку плитки' },
]


export default function AIAssistant() {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { settings } = useSettings()
  const hasApiKey = !!settings.integrations?.geminiApiKey

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const chatMutation = useMutation({
    mutationFn: (msg: string) => aiApi.chat(msg, undefined, messages),
    onSuccess: (response) => {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: response.data.message }
      ])
    },
  })

  const handleSend = () => {
    if (!message.trim() || chatMutation.isPending) return

    const userMessage = message.trim()
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setMessage('')
    chatMutation.mutate(userMessage)
  }

  const handleSuggestion = (text: string) => {
    setMessage(text)
    setMessages(prev => [...prev, { role: 'user', content: text }])
    chatMutation.mutate(text)
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col animate-fade-in">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              ИИ-помощник
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Спросите о расценках, материалах или сметном деле
            </p>
          </div>
        </div>

        {/* Быстрые действия */}
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={() => navigate('/scanner')}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all"
          >
            <Camera className="w-4 h-4" />
            Сканер фото
          </button>
          <Link
            to="/settings"
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
          >
            <Settings className="w-4 h-4" />
            Настройки
          </Link>
        </div>
      </div>

      {/* Баннер API ключа */}
      {!hasApiKey && (
        <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-800 rounded-lg">
              <Key className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Настройте API ключ для ИИ
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Для работы ИИ-функций нужен API ключ Gemini (бесплатный). Получите его за 1 минуту.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Link
                  to="/settings"
                  state={{ tab: 'integrations' }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-all"
                >
                  <Key className="w-4 h-4" />
                  Ввести API ключ
                </Link>
                <a
                  href="https://makersuite.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 rounded-lg text-sm font-medium hover:bg-amber-50 dark:hover:bg-slate-700 transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  Получить бесплатный ключ →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {hasApiKey && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-xl">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">API ключ настроен — ИИ готов к работе!</span>
          </div>
        </div>
      )}

      {/* Область чата */}
      <div className="flex-1 card overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-100 to-accent-100 dark:from-primary-900/30 dark:to-accent-900/30 flex items-center justify-center mb-6">
                <Sparkles className="w-10 h-10 text-primary-600" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Чем я могу помочь?
              </h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8">
                Я помогу найти расценки, объясню термины сметного дела и отвечу на вопросы о КС-2, КС-3, накладных расходах и многом другом.
              </p>

              {/* Кнопка сканера */}
              <button
                onClick={() => navigate('/scanner')}
                className="flex items-center gap-3 px-6 py-4 mb-6 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl hover:shadow-xl transition-all group"
              >
                <Camera className="w-6 h-6 group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <p className="font-semibold">AI Сканер фото</p>
                  <p className="text-sm text-white/80">Фото → Смета за секунды</p>
                </div>
                <Sparkles className="w-5 h-5 ml-2" />
              </button>

              {/* Подсказки */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestion(suggestion.text)}
                    className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all text-left"
                  >
                    <suggestion.icon className="w-5 h-5 text-primary-500 flex-shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {suggestion.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex',
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      'ai-chat-bubble',
                      msg.role === 'user' ? 'user' : 'assistant'
                    )}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}

              {chatMutation.isPending && (
                <div className="flex justify-start">
                  <div className="ai-chat-bubble assistant">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Поле ввода */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex gap-3">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Введите сообщение..."
              className="input flex-1"
              disabled={chatMutation.isPending}
            />
            <button
              onClick={handleSend}
              disabled={!message.trim() || chatMutation.isPending}
              className="btn-primary px-6"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">
            ИИ-помощник может допускать ошибки. Проверяйте важную информацию.
          </p>
        </div>
      </div>
    </div>
  )
}


