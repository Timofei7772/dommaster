import { cn } from '@/lib/utils'

interface BadgeProps {
  status: string;
  className?: string;
  variant?: 'slate' | 'blue' | 'emerald' | 'rose' | 'amber' | 'violet';
}

export default function Badge({ status, className, variant }: BadgeProps) {
  const text = status.toUpperCase()
  
  // Определяем цвет по статусу
  const getBadgeColors = () => {
    if (variant) return variant
    
    switch (text) {
      case 'DONE':
      case 'PAID':
      case 'COMPLETED':
      case 'SUCCESS':
      case 'HIGH':
        return 'emerald'
      case 'IN_PROGRESS':
      case 'ACTIVE':
      case 'MEDIUM':
        return 'blue'
      case 'DELAYED':
      case 'FAILED':
      case 'URGENT':
      case 'ON_HOLD':
        return 'rose'
      case 'PLANNING':
      case 'PLANNED':
      case 'NEW':
      case 'LOW':
        return 'slate'
      case 'REVIEW':
      case 'PENDING':
        return 'amber'
      default:
        return 'violet'
    }
  }

  const color = getBadgeColors()

  const colorsMap = {
    slate: 'bg-slate-500/10 text-slate-500 border-slate-500/20 dark:text-slate-400',
    blue: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
    rose: 'bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400',
    amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
    violet: 'bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-400'
  }

  // Человекочитаемый перевод
  const getStatusLabel = () => {
    switch (text) {
      case 'PLANNING': return 'Планирование'
      case 'PLANNED': return 'Планируется'
      case 'IN_PROGRESS': return 'В процессе'
      case 'ON_HOLD': return 'Приостановлен'
      case 'COMPLETED': return 'Завершен'
      case 'CANCELLED': return 'Отменен'
      case 'NOT_STARTED': return 'Не начат'
      case 'DONE': return 'Выполнено'
      case 'DELAYED': return 'Просрочен'
      case 'PAID': return 'Оплачен'
      case 'NEW': return 'Новый'
      case 'REVIEW': return 'Проверка'
      case 'LOW': return 'Низкий'
      case 'MEDIUM': return 'Средний'
      case 'HIGH': return 'Высокий'
      case 'URGENT': return 'Срочно'
      default: return status
    }
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full border',
        colorsMap[color],
        className
      )}
    >
      {getStatusLabel()}
    </span>
  )
}
