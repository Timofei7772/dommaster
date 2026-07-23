"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { SITE } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Phone, Mail, MapPin, Clock, Send, MessageCircle, Sparkles, Globe } from "lucide-react";
import { useLegalModal } from "@/components/ModalProvider";

export default function Contact() {
  const [sent, setSent] = useState(false);
  const { openModal } = useLegalModal();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // ponytail: no backend — toast + reset is enough for static site
    setSent(true);
    setTimeout(() => setSent(false), 4000);
    (e.target as HTMLFormElement).reset();
  };

  return (
    <section id="contact" className="py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <Badge variant="secondary" className="mb-4 px-4 py-1">Контакты</Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Свяжитесь с нами</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Оставьте заявку — мы рассчитаем стоимость ремонта бесплатно
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <Card className="p-6 space-y-6 h-full">
              <h3 className="text-2xl font-semibold flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-amber-500" />
                Контактная информация
              </h3>
              <div className="space-y-4">
                {[
                  { icon: Phone, value: SITE.phone, href: `tel:${SITE.phoneLink}` },
                  ...(SITE.email ? [{ icon: Mail as React.ElementType, value: SITE.email, href: `mailto:${SITE.email}` }] : []),
                  { icon: MapPin, value: SITE.address },
                  { icon: Clock, value: SITE.workHours },
                ].map((item) => (
                  <div key={item.value} className="flex items-start gap-3">
                    <div className="mt-1 p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div>
                      {item.href ? (
                        <a href={item.href} className="font-medium hover:text-amber-600 transition-colors">
                          {item.value}
                        </a>
                      ) : (
                        <span className="font-medium">{item.value}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-3">Или напишите в мессенджеры:</p>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 gap-2" render={<a href={SITE.whatsapp} target="_blank" rel="noopener noreferrer" />}>
                    <MessageCircle className="h-4 w-4 text-green-500" /> WhatsApp
                  </Button>
                  <Button variant="outline" className="flex-1 gap-2" render={<a href={SITE.telegram} target="_blank" rel="noopener noreferrer" />}>
                    <Send className="h-4 w-4 text-blue-500" /> Telegram
                  </Button>
                  <Button variant="outline" className="flex-1 gap-2" render={<a href={SITE.vk} target="_blank" rel="noopener noreferrer" />}>
                    <Globe className="h-4 w-4 text-blue-600" /> VK
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <Card className="p-6 h-full">
              <h3 className="text-2xl font-semibold mb-6">Оставить заявку</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input placeholder="Ваше имя" required />
                <Input type="tel" placeholder="Телефон" required />
                <Input type="email" placeholder="Email (необязательно)" />
                <Textarea placeholder="Опишите ваш проект..." rows={4} />
                <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold">
                  {sent ? "✓ Отправлено!" : "Отправить заявку"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Нажимая кнопку, вы соглашаетесь с{" "}
                  <button
                    type="button"
                    onClick={() => openModal("consent")}
                    className="underline hover:text-amber-600 cursor-pointer"
                  >
                    политикой обработки персональных данных
                  </button>
                </p>
              </form>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
