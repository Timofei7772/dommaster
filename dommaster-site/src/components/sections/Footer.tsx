"use client";

import { SITE, NAV_LINKS } from "@/lib/constants";
import { Phone, MapPin, ArrowUp } from "lucide-react";
import { useLegalModal } from "@/components/ModalProvider";

export default function Footer() {
  const { openModal } = useLegalModal();

  return (
    <footer className="bg-zinc-900 text-zinc-400">
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-2xl font-bold text-white mb-4">
              Dom<span className="text-amber-500">Master</span>
            </h3>
            <p className="text-sm leading-relaxed">
              {SITE.tagline}. Работаем в Салавате, Стерлитамаке, Ишимбае и других городах.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Навигация</h4>
            <nav className="flex flex-col gap-2 text-sm">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} className="hover:text-amber-400 transition-colors">
                  {l.label}
                </a>
              ))}
            </nav>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Документы</h4>
            <nav className="flex flex-col gap-2 text-sm">
              <button onClick={() => openModal("policy")} className="text-left hover:text-amber-400 transition-colors cursor-pointer">
                Политика конфиденциальности
              </button>
              <button onClick={() => openModal("consent")} className="text-left hover:text-amber-400 transition-colors cursor-pointer">
                Обработка персональных данных
              </button>
              <button onClick={() => openModal("oferta")} className="text-left hover:text-amber-400 transition-colors cursor-pointer">
                Договор оферты
              </button>
              <a href="#docs" className="hover:text-amber-400 transition-colors">
                Реквизиты
              </a>
            </nav>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Контакты</h4>
            <div className="space-y-3 text-sm">
              <a href={`tel:${SITE.phoneLink}`} className="flex items-center gap-2 hover:text-amber-400 transition-colors">
                <Phone className="h-4 w-4 text-amber-500" /> {SITE.phone}
              </a>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-amber-500 mt-0.5" /> {SITE.address}
              </div>
              <div className="text-xs text-zinc-500 mt-2">
                <a href={SITE.whatsapp} target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors block">WhatsApp</a>
                <a href={SITE.telegram} target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors block">Telegram</a>
                <a href={SITE.vk} target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors block">VK</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-800 py-6">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-sm">
          <p>© {new Date().getFullYear()} ООО РСК ДОММАСТЕР. Все права защищены. Информация на сайте не является публичной офертой.</p>
          <a href="#" className="flex items-center gap-1 hover:text-amber-400 transition-colors shrink-0">
            Наверх <ArrowUp className="h-3 w-3" />
          </a>
        </div>
      </div>
    </footer>
  );
}
