"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CITIES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import photos from "@/lib/photos.json";

const PHOTOS = photos.map((src, i) => ({ id: i, src: `/photos/${src}` }));
const ALL_CITIES = ["Все", ...CITIES];

export default function Portfolio() {
  const [filter, setFilter] = useState("Все");
  const [selected, setSelected] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = filter === "Все" ? PHOTOS : PHOTOS.slice(0, 40);
  const scroll = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  return (
    <section id="portfolio" className="py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <Badge variant="secondary" className="mb-4 px-4 py-1">Портфолио</Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Наши работы</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Более 150 реализованных проектов — от студий до коттеджей
          </p>

          <div className="flex flex-wrap gap-2 justify-center mt-8">
            {ALL_CITIES.map((c) => (
              <Button
                key={c}
                variant={filter === c ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(c)}
                className="rounded-full"
              >
                {c}
              </Button>
            ))}
          </div>
        </motion.div>

        <div className="relative group">
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4"
            style={{ scrollbarWidth: "none" }}
          >
            {filtered.map((photo, i) => (
              <motion.button
                key={photo.id}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                transition={{ delay: (i % 12) * 0.06 }}
                className="snap-start flex-shrink-0 w-[280px] h-[360px] rounded-xl overflow-hidden relative group/card"
                onClick={() => setSelected(i)}
              >
                <img
                  src={photo.src}
                  alt={`Работа ${photo.id + 1}`}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/20 transition-colors" />
              </motion.button>
            ))}
          </div>
          <button
            onClick={() => scroll(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm rounded-full p-2 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => scroll(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm rounded-full p-2 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {selected !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setSelected(null)}
          >
            <button
              className="absolute top-4 right-4 text-white/70 hover:text-white"
              onClick={() => setSelected(null)}
            >
              <X className="h-8 w-8" />
            </button>

            {selected > 0 && (
              <button
                className="absolute left-4 text-white/70 hover:text-white"
                onClick={(e) => { e.stopPropagation(); setSelected(selected - 1); }}
              >
                <ChevronLeft className="h-10 w-10" />
              </button>
            )}
            {selected < filtered.length - 1 && (
              <button
                className="absolute right-4 text-white/70 hover:text-white"
                onClick={(e) => { e.stopPropagation(); setSelected(selected + 1); }}
              >
                <ChevronRight className="h-10 w-10" />
              </button>
            )}

            <motion.img
              key={filtered[selected]?.id}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={filtered[selected]?.src}
              alt=""
              className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
