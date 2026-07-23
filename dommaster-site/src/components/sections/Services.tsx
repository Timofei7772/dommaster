"use client";

import { motion } from "framer-motion";
import { SERVICES } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Paintbrush, Wrench, Ruler, Building, Home, Store } from "lucide-react";

const ICON_MAP: Record<string, React.ReactNode> = {
  Paintbrush: <Paintbrush className="h-8 w-8" />,
  Wrench: <Wrench className="h-8 w-8" />,
  Ruler: <Ruler className="h-8 w-8" />,
  Building: <Building className="h-8 w-8" />,
  Home: <Home className="h-8 w-8" />,
  Store: <Store className="h-8 w-8" />,
};

export default function Services() {
  return (
    <section id="services" className="py-24 px-4 bg-muted/30">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <Badge variant="secondary" className="mb-4 px-4 py-1 text-sm">Наши услуги</Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Что мы предлагаем</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            От косметического ремонта до полной отделки под ключ — подберём решение под ваш бюджет
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SERVICES.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="group p-6 h-full hover:shadow-lg hover:border-amber-500/30 transition-all duration-300 cursor-default">
                <div className="text-amber-500 mb-4 group-hover:scale-110 transition-transform">
                  {ICON_MAP[s.icon]}
                </div>
                <h3 className="text-xl font-semibold mb-2">{s.title}</h3>
                <p className="text-muted-foreground mb-4">{s.desc}</p>
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                  {s.price}
                </Badge>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
