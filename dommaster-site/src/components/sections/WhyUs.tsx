"use client";

import { motion } from "framer-motion";
import { ADVANTAGES } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, BadgeCheck, FileCheck, Timer, Award, Users } from "lucide-react";

const ICON_MAP: Record<string, React.ReactNode> = {
  Shield: <Shield className="h-8 w-8" />,
  BadgeCheck: <BadgeCheck className="h-8 w-8" />,
  FileCheck: <FileCheck className="h-8 w-8" />,
  Timer: <Timer className="h-8 w-8" />,
  Award: <Award className="h-8 w-8" />,
  Users: <Users className="h-8 w-8" />,
};

export default function WhyUs() {
  return (
    <section id="why-us" className="py-24 px-4 bg-muted/30">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <Badge variant="secondary" className="mb-4 px-4 py-1">Преимущества</Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Почему выбирают нас</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Мы делаем ремонт, которым гордимся. И наши клиенты это подтверждают
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ADVANTAGES.map((a, i) => (
            <motion.div
              key={a.title}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="p-6 h-full text-center hover:shadow-md transition-shadow">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 mb-4">
                  {ICON_MAP[a.icon]}
                </div>
                <h3 className="text-lg font-semibold mb-2">{a.title}</h3>
                <p className="text-muted-foreground text-sm">{a.desc}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
