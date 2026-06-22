import { useState } from 'react'
import { Check, Copy, ArrowLeft, Shield, Mail, CreditCard } from 'lucide-react'
import { Link } from 'react-router-dom'

// ПЛАТЕЖНЫЕ РЕКВИЗИТЫ - ТОЛЬКО КАРТА YOOMONEY!
const PAYMENT_CONFIG = {
  card: '2204 1201 0704 3990',
  cardRaw: '2204120107043990',
  holder: 'YOOMONEY VIRTUAL',
  paymentLink: 'https://yoomoney.ru/to/2204120107043990/2500',
  telegram: '@ZARU_Support'
}

type Step = 'info' | 'payment' | 'done'

export default function Purchase() {
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<Step>('info')
  const [copied, setCopied] = useState(false)

  const PRICE = 2500

  const copyCard = () => {
    navigator.clipboard.writeText(PAYMENT_CONFIG.cardRaw)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleProceed = () => {
    if (!email || !email.includes('@')) {
      alert('Введите корректный email для получения лицензии')
      return
    }
    setStep('payment')
  }

  const handlePaymentDone = () => setStep('done')

  // Шаг 2: Оплата
  if (step === 'payment') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => setStep('info')}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" /> Назад
          </button>

          <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CreditCard className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Оплата картой YooMoney</h2>
              <p className="text-slate-400">
                Лицензия на 1 год — {PRICE.toLocaleString()} руб
              </p>
            </div>

            <div className="space-y-6">
              {/* Быстрая оплата по ссылке */}
              <a
                href={PAYMENT_CONFIG.paymentLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold py-4 rounded-xl transition-all shadow-lg text-center text-lg"
              >
                💳 Оплатить {PRICE.toLocaleString()} руб
              </a>

              <div className="text-center text-slate-400 text-sm">или переведите вручную:</div>

              {/* Номер карты */}
              <div className="bg-purple-900/30 border border-purple-700 rounded-xl p-4">
                <div className="text-sm text-purple-400 mb-2">Номер карты YooMoney</div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-2xl font-bold text-white font-mono">
                    {PAYMENT_CONFIG.card}
                  </span>
                  <button
                    onClick={copyCard}
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg transition-colors shrink-0"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Скопировано' : 'Копировать'}
                  </button>
                </div>
                <div className="text-sm text-slate-400 mt-2">
                  Получатель: {PAYMENT_CONFIG.holder}
                </div>
              </div>

              <div className="bg-slate-900 rounded-xl p-4">
                <div className="text-sm text-slate-400 mb-1">Сумма к оплате</div>
                <div className="text-3xl font-bold text-white">
                  {PRICE.toLocaleString()} руб
                </div>
              </div>

              <div className="bg-blue-900/30 border border-blue-700 rounded-xl p-4">
                <div className="text-sm text-blue-400 mb-1">После оплаты отправьте в Telegram</div>
                <div className="text-lg text-white">{PAYMENT_CONFIG.telegram}</div>
                <div className="text-sm text-slate-400 mt-1">Скриншот + ваш email: {email}</div>
              </div>

              <button
                onClick={handlePaymentDone}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold py-4 rounded-xl transition-all shadow-lg"
              >
                Я оплатил(а)
              </button>

              <p className="text-center text-slate-500 text-sm">
                Лицензия придет на {email} в течение 24 часов
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Шаг 3: Спасибо
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
        <div className="max-w-lg mx-auto text-center">
          <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-2xl">
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Спасибо за покупку!</h2>
            <p className="text-slate-400 mb-6">
              Лицензия будет отправлена на <span className="text-white font-semibold">{email}</span>
            </p>
            <div className="bg-slate-900 rounded-xl p-4 mb-6">
              <div className="text-lg text-white font-semibold">
                Лицензия на 1 год - {PRICE.toLocaleString()} руб
              </div>
            </div>
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-8 py-4 rounded-xl transition-all shadow-lg"
            >
              <ArrowLeft className="w-5 h-5" /> В программу
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Шаг 1: Информация о тарифе
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" /> Вернуться
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">Z</span>
            </div>
            <span className="text-white font-semibold">ZARU Смета</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-slate-800 rounded-3xl p-8 border border-slate-700 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
              <Shield className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">ZARU Смета</h1>
            <p className="text-slate-400">Профессиональная программа для составления смет</p>
          </div>

          <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl p-6 mb-8 border border-blue-500/30">
            <div className="text-center">
              <div className="text-slate-400 mb-2">Лицензия на 1 год</div>
              <div className="text-5xl font-bold text-white mb-2">
                {PRICE.toLocaleString()} <span className="text-2xl">руб</span>
              </div>
              <div className="text-emerald-400 text-sm">
                Честная цена за профессиональный продукт
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            {[
              'Неограниченные сметы',
              'ИИ-анализ фото',
              'Экспорт PDF/HTML',
              '300+ видов работ',
              'Обновления 1 год',
              'Telegram поддержка',
              'Windows/Web версия',
              'Работа оффлайн'
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-2 text-slate-300">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          <div className="mb-6">
            <label className="block text-sm text-slate-400 mb-2">Email для получения лицензии</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full bg-slate-900 border border-slate-600 rounded-xl pl-12 pr-4 py-4 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors text-lg"
              />
            </div>
          </div>

          <button
            onClick={handleProceed}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold py-5 rounded-xl shadow-lg transition-all text-xl"
          >
            Купить за {PRICE.toLocaleString()} руб
          </button>

          <div className="mt-6 text-center">
            <div className="text-slate-500 text-sm mb-2">Способ оплаты</div>
            <div className="flex items-center justify-center gap-4 text-slate-400">
              <span className="flex items-center gap-1">
                <CreditCard className="w-4 h-4" /> Карта YooMoney
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-4 py-2 text-emerald-400">
            <Check className="w-4 h-4" />
            <span>Официальная коммерческая лицензия</span>
          </div>
        </div>

        <div className="text-center mt-8 text-slate-500 text-sm space-y-2">
          <p>&copy; 2024–2026 ZARU Software. Все права защищены.</p>
          <p>Telegram: {PAYMENT_CONFIG.telegram}</p>
          <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed mt-3">
            Программа для ЭВМ «ZaruAI Смета» является лицензионным программным обеспечением
            и охраняется законодательством Российской Федерации об интеллектуальной собственности.
            Незаконное копирование, распространение или модификация данного ПО преследуется
            в соответствии со ст. 1270, 1301 ГК РФ (часть IV), ст. 146 УК РФ.
            Информация на данной странице не является публичной офертой (ст. 437 ГК РФ).
            Реклама. ИП/ООО «ЗАРУ Софтвер». Erid: не требуется (собственный продукт).
          </p>
        </div>
      </div>
    </div>
  )
}
