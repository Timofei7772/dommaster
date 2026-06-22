/**
 * ZARU Смета - Компонент онбординга для новых пользователей
 * Пошаговый интерактивный туториал
 */

import { useState, useEffect } from 'react'
import {
    X,
    ChevronRight,
    ChevronLeft,
    FileText,
    Calculator,
    Upload,
    Settings,
    Sparkles,
    CheckCircle
} from 'lucide-react'

interface OnboardingStep {
    id: number
    title: string
    description: string
    icon: typeof FileText
    highlight?: string
}

const steps: OnboardingStep[] = [
    {
        id: 1,
        title: 'Добро пожаловать в ZARU Смета!',
        description: 'Профессиональная программа для составления смет на ремонтно-строительные работы. Давайте познакомимся с основными функциями.',
        icon: Sparkles
    },
    {
        id: 2,
        title: 'Создание сметы',
        description: 'Перейдите в раздел "Сметы" и нажмите "Новая смета". Добавляйте работы и материалы из каталога или вручную.',
        icon: FileText,
        highlight: '/estimates'
    },
    {
        id: 3,
        title: 'Расчёт стоимости',
        description: 'Программа автоматически рассчитает стоимость работ, материалов, накладные расходы и сметную прибыль.',
        icon: Calculator
    },
    {
        id: 4,
        title: 'Печать документов',
        description: 'Формируйте КС-2, КС-3, акты и счета прямо из сметы. Документы сохраняются в PDF.',
        icon: Upload,
        highlight: '/documents'
    },
    {
        id: 5,
        title: 'Настройки',
        description: 'Настройте реквизиты компании, ставки НДС и региональные коэффициенты в разделе "Настройки".',
        icon: Settings,
        highlight: '/settings'
    }
]

export default function Onboarding() {
    const [isOpen, setIsOpen] = useState(false)
    const [currentStep, setCurrentStep] = useState(0)
    const [completed, setCompleted] = useState(false)

    useEffect(() => {
        const shown = localStorage.getItem('zaru_onboarding_completed')
        if (!shown) {
            setIsOpen(true)
        }
    }, [])

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(prev => prev + 1)
        } else {
            handleComplete()
        }
    }

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1)
        }
    }

    const handleComplete = () => {
        localStorage.setItem('zaru_onboarding_completed', 'true')
        setCompleted(true)
        setTimeout(() => setIsOpen(false), 1500)
    }

    const handleSkip = () => {
        localStorage.setItem('zaru_onboarding_completed', 'true')
        setIsOpen(false)
    }

    if (!isOpen) return null

    const step = steps[currentStep]
    const StepIcon = step.icon

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-fade-in">
                {/* Header */}
                <div className="bg-gradient-to-r from-primary-600 to-indigo-600 p-6 text-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                                <StepIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-white/70">Шаг {currentStep + 1} из {steps.length}</p>
                                <h2 className="text-xl font-bold">{step.title}</h2>
                            </div>
                        </div>
                        <button onClick={handleSkip} className="p-2 hover:bg-white/10 rounded-lg">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Progress */}
                <div className="flex gap-1 px-6 pt-4">
                    {steps.map((_, i) => (
                        <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-all ${i <= currentStep ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-700'
                                }`}
                        />
                    ))}
                </div>

                {/* Content */}
                <div className="p-6">
                    {completed ? (
                        <div className="text-center py-8">
                            <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
                            <h3 className="text-xl font-bold mb-2">Готово!</h3>
                            <p className="text-slate-500">Приятной работы с ZARU Смета</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-slate-600 dark:text-slate-300 text-lg leading-relaxed">
                                {step.description}
                            </p>

                            {step.highlight && (
                                <div className="mt-4 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
                                    <p className="text-sm text-primary-700 dark:text-primary-300">
                                        💡 Перейдите в: <code className="font-mono bg-primary-100 dark:bg-primary-800 px-2 py-0.5 rounded">{step.highlight}</code>
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {!completed && (
                    <div className="flex items-center justify-between p-6 border-t border-slate-200 dark:border-slate-700">
                        <button
                            onClick={handleSkip}
                            className="text-slate-500 hover:text-slate-700 text-sm"
                        >
                            Пропустить туториал
                        </button>
                        <div className="flex gap-2">
                            {currentStep > 0 && (
                                <button onClick={handlePrev} className="btn-secondary flex items-center gap-1">
                                    <ChevronLeft className="w-4 h-4" />
                                    Назад
                                </button>
                            )}
                            <button onClick={handleNext} className="btn-primary flex items-center gap-1">
                                {currentStep === steps.length - 1 ? 'Завершить' : 'Далее'}
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
