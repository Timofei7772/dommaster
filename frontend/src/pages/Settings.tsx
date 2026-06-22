import { useState, useEffect } from 'react'
import { apiGet, apiPost } from '@/lib/api-client'
import { 
  Settings as SettingsIcon, Save, Key, Cpu, MessageSquare, Send, Search, Smartphone, FolderKanban, Loader2
} from 'lucide-react'
import { useToast } from '@/hooks/useToast'

interface Project {
  id: number
  name: string
  code?: string
}

interface Integration {
  id?: number
  provider: string
  token?: string
  apiSecret?: string
  webhookUrl?: string
  username?: string
  status: boolean
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'ai' | 'integrations'>('ai')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  // Состояния интеграций
  const [projects, setProjects] = useState<Project[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  
  // Данные для полей
  const [tgToken, setTgToken] = useState('')
  const [tgBotName, setTgBotName] = useState('')
  const [tgStatus, setTgStatus] = useState(false)

  const [waToken, setWaToken] = useState('')
  const [waInstance, setWaInstance] = useState('')
  const [waStatus, setWaStatus] = useState(false)

  const [vkToken, setVkToken] = useState('')
  const [vkStatus, setVkStatus] = useState(false)

  // Парсер Avito
  const [avitoQuery, setAvitoQuery] = useState('ремонт квартир')
  const [avitoRegion, setAvitoRegion] = useState('https://www.avito.ru/moskva')
  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('')
  const [syncingAvito, setSyncingAvito] = useState(false)

  useEffect(() => {
    // Получаем ИИ ключ
    apiGet<{openai_api_key: string}>('/settings/')
      .then(res => {
        setApiKey(res.openai_api_key || '')
      })
      .catch()

    // Получаем проекты компании
    apiGet<Project[]>('/crm-projects/')
      .then(res => {
        setProjects(res)
        if (res.length > 0) setSelectedProjectId(res[0].id)
      })
      .catch()

    // Получаем текущие интеграции
    fetchIntegrations()
  }, [])

  const fetchIntegrations = async () => {
    try {
      const data = await apiGet<Integration[]>('/integrations/settings')
      setIntegrations(data)
      
      const tg = data.find(i => i.provider === 'TELEGRAM')
      if (tg) {
        setTgToken(tg.token || '')
        setTgBotName(tg.username || '')
        setTgStatus(tg.status)
      }

      const wa = data.find(i => i.provider === 'WHATSAPP')
      if (wa) {
        setWaToken(wa.token || '')
        setWaInstance(wa.username || '')
        setWaStatus(wa.status)
      }

      const vk = data.find(i => i.provider === 'VK')
      if (vk) {
        setVkToken(vk.token || '')
        setVkStatus(vk.status)
      }
    } catch (e) {}
  }

  const handleSaveAi = async () => {
    setLoading(true)
    try {
      await apiPost('/settings/', { openai_api_key: apiKey })
      toast.success('Настройки ИИ успешно сохранены')
    } catch (e) {
      toast.error('Ошибка сохранения')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveIntegration = async (provider: string, data: Partial<Integration>) => {
    try {
      await apiPost('/integrations/settings', {
        provider,
        ...data
      })
      toast.success(`Интеграция ${provider} успешно обновлена`)
      fetchIntegrations()
    } catch (e: any) {
      toast.error('Ошибка сохранения интеграции: ' + e.message)
    }
  }

  const handleSyncAvito = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProjectId) {
      toast.error('Сначала выберите проект для привязки заказов')
      return
    }

    setSyncingAvito(true)
    try {
      const res = await apiPost<any>('/integrations/avito/sync', {
        projectId: Number(selectedProjectId),
        query: avitoQuery,
        regionUrl: avitoRegion
      })
      toast.success(res.message || 'Синхронизация заказов Avito выполнена!')
    } catch (e: any) {
      toast.error('Ошибка синхронизации Avito: ' + e.message)
    } finally {
      setSyncingAvito(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 text-slate-800 dark:text-slate-100">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="w-8 h-8 text-slate-800 dark:text-white" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Настройки системы</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-850 pb-px mb-6">
        <button
          onClick={() => setActiveTab('ai')}
          className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-all -mb-px border-b-2 ${
            activeTab === 'ai' 
              ? 'border-violet-600 text-violet-600 dark:text-violet-400' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          ИИ Ассистент
        </button>
        <button
          onClick={() => setActiveTab('integrations')}
          className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-all -mb-px border-b-2 ${
            activeTab === 'integrations' 
              ? 'border-violet-600 text-violet-600 dark:text-violet-400' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Мессенджеры и Площадки
        </button>
      </div>

      {/* TAB 1: AI Settings */}
      {activeTab === 'ai' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700/50 overflow-hidden">
          <div className="p-4 border-b border-slate-150 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-500" />
            <h2 className="font-semibold text-slate-700 dark:text-slate-350">Интеграция AI (Опционально)</h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-500 max-w-xl">
              SmetaAI позволяет подключить внешние нейросети для помощи в расчетах смет, распознавании чертежей и отработке сложных клиентских возражений.
            </p>

            <div className="pt-4 max-w-md">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                <Key className="w-4 h-4 text-slate-400" />
                Ключ доступа OpenAI (API Key)
              </label>
              <input 
                type="password" 
                placeholder="sk-..." 
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white focus:outline-none focus:border-violet-500 text-sm font-mono"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-2">Ключ хранится локально и никогда не передается третьим лицам (кроме API OpenAI).</p>
            </div>

            <div className="pt-4">
              <button 
                onClick={handleSaveAi} 
                disabled={loading} 
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                {loading ? 'Сохранение...' : 'Сохранить настройки'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Messengers & Marketplaces */}
      {activeTab === 'integrations' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Column 1: Messengers */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Telegram Bot */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Send className="w-5 h-5 text-sky-500" />
                  Telegram Bot интеграция
                </h3>
                <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full ${tgStatus ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
                  {tgStatus ? 'АКТИВЕН' : 'ОТКЛЮЧЕН'}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-normal">
                Автоматическая отправка уведомлений клиентам об этапах работ, счетах и фотоотчетах прямо в Telegram.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">API Token бота</label>
                  <input
                    type="password"
                    placeholder="54917...:AAEfG..."
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-950 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Юзернейм бота (@username)</label>
                  <input
                    type="text"
                    placeholder="SmetaCRM_bot"
                    value={tgBotName}
                    onChange={(e) => setTgBotName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-950 dark:text-white focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="tg-status"
                  checked={tgStatus}
                  onChange={(e) => setTgStatus(e.target.checked)}
                  className="rounded border-slate-200 text-violet-600 focus:ring-violet-500"
                />
                <label htmlFor="tg-status" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Активировать отправку сообщений</label>
              </div>
              <button
                onClick={() => handleSaveIntegration('TELEGRAM', { token: tgToken, username: tgBotName, status: tgStatus })}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-xs font-semibold rounded-xl transition-colors"
              >
                Сохранить Telegram
              </button>
            </div>

            {/* WhatsApp (GreenAPI) */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-500" />
                  WhatsApp (GreenAPI / ChatAPI)
                </h3>
                <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full ${waStatus ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
                  {waStatus ? 'АКТИВЕН' : 'ОТКЛЮЧЕН'}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-normal">
                Рассылка смет в PDF, фотоотчетов и напоминаний о графике платежей клиентам в WhatsApp.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">API Token / Ключ</label>
                  <input
                    type="password"
                    placeholder="whatsapp-token"
                    value={waToken}
                    onChange={(e) => setWaToken(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-950 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Instance ID / Номер инстанса</label>
                  <input
                    type="text"
                    placeholder="1101859302"
                    value={waInstance}
                    onChange={(e) => setWaInstance(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-950 dark:text-white focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="wa-status"
                  checked={waStatus}
                  onChange={(e) => setWaStatus(e.target.checked)}
                  className="rounded border-slate-200 text-violet-600 focus:ring-violet-500"
                />
                <label htmlFor="wa-status" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Активировать оповещения по WhatsApp</label>
              </div>
              <button
                onClick={() => handleSaveIntegration('WHATSAPP', { token: waToken, username: waInstance, status: waStatus })}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-xs font-semibold rounded-xl transition-colors"
              >
                Сохранить WhatsApp
              </button>
            </div>

            {/* VK Communities */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-500" />
                  ВКонтакте (VK API сообщества)
                </h3>
                <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full ${vkStatus ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
                  {vkStatus ? 'АКТИВЕН' : 'ОТКЛЮЧЕН'}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-normal">
                Привязка личных сообщений группы ВКонтакте для импорта вопросов клиентов в карточки CRM.
              </p>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Ключ доступа сообщества (Token)</label>
                <input
                  type="password"
                  placeholder="vk_access_token_..."
                  value={vkToken}
                  onChange={(e) => setVkToken(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-950 dark:text-white focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="vk-status"
                  checked={vkStatus}
                  onChange={(e) => setVkStatus(e.target.checked)}
                  className="rounded border-slate-200 text-violet-600 focus:ring-violet-500"
                />
                <label htmlFor="vk-status" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Активировать импорт лидов VK</label>
              </div>
              <button
                onClick={() => handleSaveIntegration('VK', { token: vkToken, status: vkStatus })}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-xs font-semibold rounded-xl transition-colors"
              >
                Сохранить ВКонтакте
              </button>
            </div>

          </div>

          {/* Column 2: Avito Lead Sync Panel */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Search className="w-5 h-5 text-orange-500" />
              Парсер и Синхронизация Avito
            </h3>
            <p className="text-xs text-slate-500 leading-normal">
              Поиск заказов на строительные работы на Avito и импорт объявлений в качестве входящих заявок на доску Kanban.
            </p>

            <form onSubmit={handleSyncAvito} className="space-y-3 pt-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Поисковый запрос</label>
                <input
                  type="text"
                  required
                  placeholder="Ремонт квартир / Укладка плитки"
                  value={avitoQuery}
                  onChange={(e) => setAvitoQuery(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-950 dark:text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Ссылка на регион (Avito URL)</label>
                <input
                  type="text"
                  required
                  placeholder="https://www.avito.ru/moskva"
                  value={avitoRegion}
                  onChange={(e) => setAvitoRegion(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-950 dark:text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Импортировать в проект</label>
                <select
                  required
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-950 dark:text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="">Выберите объект...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={syncingAvito}
                className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 mt-4"
              >
                {syncingAvito ? (
                  <>
                    <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    Поиск объявлений Puppeteer...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Найти заказы и импортировать
                  </>
                )}
              </button>
            </form>
          </div>

        </div>
      )}
    </div>
  )
}
