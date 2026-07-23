"use client";

import { motion } from "framer-motion";
import { SITE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { useEffect, useState } from "react";
import photos from "@/lib/photos.json";

const HERO_PHOTOS = photos.slice(0, 10);

export default function Hero() {
  const [bgIndex, setBgIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setBgIndex((i) => (i + 1) % HERO_PHOTOS.length), 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {HERO_PHOTOS.map((src, i) => (
        <div
          key={src}
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: i === bgIndex ? 1 : 0 }}
        >
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(/photos/${src})` }}
          />
        </div>
      ))}
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-amber-400 font-semibold tracking-wide uppercase mb-3"
        >
          Ремонт под ключ в Салавате, Стерлитамаке и Ишимбае
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-tight mb-6"
        >
          Воплощаем ваш идеальный <br />
          <span className="text-amber-400">ремонт в реальность</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto mb-8"
        >
          {SITE.tagline}. Более 120 объектов. Гарантия 3 года.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-black text-lg px-8 py-6 rounded-xl" render={<a href="#contact" />}>
            Рассчитать стоимость <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 text-lg px-8 py-6 rounded-xl" render={<a href="#portfolio" />}>
            <Play className="mr-2 h-5 w-5" /> Наши работы
          </Button>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="absolute bottom-0 left-0 right-0 bg-white/10 backdrop-blur-md border-t border-white/10"
      >
        <div className="max-w-5xl mx-auto grid grid-cols-3 divide-x divide-white/10 py-4">
          {[
            { value: "120+", label: "Объектов" },
            { value: "10 лет", label: "Опыта" },
            { value: "3 года", label: "Гарантии" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-sm text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
