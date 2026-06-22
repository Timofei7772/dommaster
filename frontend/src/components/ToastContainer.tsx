import { useToastStore } from '@/lib/toast'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'


const icons = {
  success: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
  error: <AlertCircle className="w-5 h-5 text-red-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div 
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-xl p-3 min-w-[300px] animate-in slide-in-from-right-8 fade-in duration-300"
        >
          {icons[toast.type]}
          <p className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200">
            {toast.message}
          </p>
          <button 
            onClick={() => removeToast(toast.id)}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
