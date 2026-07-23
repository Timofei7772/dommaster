"use client";

import { motion } from "framer-motion";
import { PROCESS_STEPS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

export default function Process() {
  return (
    <section id="process" className="py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <Badge variant="secondary" className="mb-4 px-4 py-1">Как мы работаем</Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Процесс работы</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            От первой заявки до ключей — прозрачно и понятно
          </p>
        </motion.div>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[23px] top-0 bottom-0 w-0.5 bg-amber-200 dark:bg-amber-800 hidden md:block" />

          <div className="space-y-12">
            {PROCESS_STEPS.map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="flex flex-col md:flex-row gap-6 items-start"
              >
                <div className="flex-shrink-0 z-10 flex items-center gap-4 md:flex-col md:items-center">
                  <div className="w-12 h-12 rounded-full bg-amber-500 text-black font-bold text-lg flex items-center justify-center shadow-md">
                    {step.step}
                  </div>
                </div>
                <div className="flex-1 md:pt-3 md:ml-0 ml-4">
                  <h3 className="text-xl font-semibold mb-1">{step.title}</h3>
                  <p className="text-muted-foreground">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
