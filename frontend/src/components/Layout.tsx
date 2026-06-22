import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Hammer,
  Package,
  FileCheck,
  FileSpreadsheet,
  FileSignature,
  Users,
  Bot,
  Settings,
  Moon,
  Sun,
  Menu,
  X,
  Building2,
  Camera,
  Upload,
  Briefcase,
  Truck,
  UserCheck,
  ShoppingCart,
  BookOpen,
  ChevronDown,
  MessageSquare,
  Printer,
  CalendarDays,
  Key,
  Database,
  Calculator,
  BarChart,
  Search,
  Pen,
  MapPin
} from 'lucide-react'
import { useState } from 'react'
import { useThemeStore } from '@/store/theme'
import { cn } from '@/lib/utils'

// Иконка конвейера (встроенная SVG, чтобы не тянуть новую зависимость)
const PipelineIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="6" height="5" rx="1" />
    <rect x="9" y="8" width="6" height="5" rx="1" />
    <rect x="16" y="13" width="6" height="5" rx="1" />
    <path d="M5 8v2a1 1 0 001 1h3" />
    <path d="M12 13v2a1 1 0 001 1h3" />
  </svg>
)

const navigation = [
  { name: 'Главная', href: '/dashboard', icon: LayoutDashboard },
  { name: 'CRM Проекты', href: '/crm', icon: Briefcase, badge: 'CRM' },
  { name: 'Задачи (Канбан)', href: '/requests', icon: PipelineIcon },
  { name: 'Аналитика', href: '/analytics', icon: BarChart },
  { name: 'Панель руководителя', href: '/director', icon: BarChart, badge: 'BOSS' },
  { name: 'Шаблоны', href: '/templates', icon: MessageSquare, badge: 'AUTO' },
  { name: 'Сканер смет', href: '/scanner', icon: Camera, badge: 'AI' },
  { name: 'Сметы', href: '/estimates', icon: FileText },
  { name: 'КП', href: '/commercial-proposal', icon: Briefcase },
  { name: 'Календарь', href: '/calendar', icon: CalendarDays },
  { name: 'Работы', href: '/works', icon: Hammer },
  { name: 'Материалы', href: '/materials', icon: Package },
]

const references = [
  { name: 'Контрагенты', href: '/contractors', icon: Truck },
  { name: 'Мастера', href: '/workers', icon: UserCheck },
  { name: 'ФОТ', href: '/fot', icon: Calculator },
  { name: 'Заявки', href: '/material-requests', icon: ShoppingCart },
  { name: 'Справочники', href: '/references', icon: BookOpen },
  { name: 'Цены региона', href: '/local-prices', icon: Calculator },
]

const documents = [
  { name: 'Печать', href: '/documents', icon: Printer },
  { name: 'КС-2', href: '/ks2', icon: FileCheck },
  { name: 'КС-3', href: '/ks3', icon: FileSpreadsheet },
  { name: 'М-29', href: '/m29', icon: FileSpreadsheet },
  { name: 'Договоры', href: '/contracts', icon: FileSignature },
]

const other = [
  { name: 'Импорт', href: '/import', icon: Upload },
  { name: 'Клиенты', href: '/clients', icon: Users },
  { name: 'ИИ-помощник', href: '/ai', icon: Bot },
  { name: 'Анализ конкурентов', href: '/competitor-analysis', icon: Search },
  { name: 'Распознавание', href: '/handwriting-ocr', icon: Camera, badge: 'AI' },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [refsOpen, setRefsOpen] = useState(true)
  const [docsOpen, setDocsOpen] = useState(false)
  const { isDark, toggle } = useThemeStore()
  const location = useLocation()

  const NavSection = ({ title, items, isOpen, onToggle }: {
    title: string;
    items: typeof navigation;
    isOpen?: boolean;
    onToggle?: () => void
  }) => (
    <div className="mb-2">
      {onToggle ? (
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-slate-400 uppercase tracking-wider hover:text-slate-300"
        >
          {title}
          <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen ? "" : "-rotate-90")} />
        </button>
      ) : (
        <div className="px-3 py-1.5 text-xs font-medium text-slate-400 uppercase tracking-wider">
          {title}
        </div>
      )}
      {(isOpen ?? true) && (
        <div className="space-y-0.5">
          {items.map((item) => {
            const isActive = location.pathname.startsWith(item.href)
            return (
              <NavLink
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "sidebar-item",
                  isActive && "active"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
                {item.badge && (
                  <span className="ml-auto px-2 py-0.5 text-xs bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-full">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Mobile menu */}
      <div className="lg:hidden">
        <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary-600" />
            <span className="font-bold text-lg">ZARU Смета</span>
          </div>
          <button onClick={toggle} className="p-2 -mr-2">
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-50 h-full w-64 bg-slate-900 transform transition-transform duration-300 lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg text-white">ZARU Смета</h1>
                <p className="text-xs text-slate-400">Профессионально</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 overflow-y-auto">
            <NavSection title="Основное" items={navigation} />
            <NavSection title="База данных" items={references} isOpen={refsOpen} onToggle={() => setRefsOpen(!refsOpen)} />
            <NavSection title="Документы" items={documents} isOpen={docsOpen} onToggle={() => setDocsOpen(!docsOpen)} />
            <NavSection title="Прочее" items={other} />
          </nav>

          {/* Bottom section */}
          <div className="px-3 py-4 border-t border-slate-700">
            <NavLink
              to="/activation"
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "sidebar-item",
                location.pathname === '/activation' && "active"
              )}
            >
              <Key className="w-5 h-5" />
              <span>Лицензия</span>
            </NavLink>

            <NavLink
              to="/settings"
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "sidebar-item",
                location.pathname === '/settings' && "active"
              )}
            >
              <Settings className="w-5 h-5" />
              <span>Настройки</span>
            </NavLink>

            <button
              onClick={toggle}
              className="sidebar-item w-full mt-1"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              <span>{isDark ? 'Светлая тема' : 'Тёмная тема'}</span>
            </button>

            <button
              onClick={() => {
                localStorage.removeItem('access_token')
                localStorage.removeItem('refresh_token')
                localStorage.removeItem('user_profile')
                window.location.href = '/login'
              }}
              className="sidebar-item w-full mt-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30"
            >
              <X className="w-5 h-5 text-rose-500" />
              <span>Выйти</span>
            </button>
          </div>

          {/* Version & License */}
          <div className="px-6 py-3 text-xs text-slate-500 space-y-1">
            <p>Версия 2.1.0 PRO</p>
            <p className="text-[10px] text-slate-400 leading-tight">&copy; 2024–2026 ZARU Software. Все права защищены. Лицензионное ПО.</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64 min-h-screen pt-14 lg:pt-0">
        <div className="p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
