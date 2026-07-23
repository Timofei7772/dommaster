"use client";

import { Shield, FileText, Megaphone, Scale } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import LegalModals from "@/components/LegalModals";
import { useState } from "react";

const DOCS = [
  {
    id: "policy",
    icon: Shield,
    title: "Политика конфиденциальности",
    desc: "ФЗ-152 «О персональных данных»",
  },
  {
    id: "oferta",
    icon: FileText,
    title: "Договор публичной оферты",
    desc: "Ст. 435–437 ГК РФ",
  },
  {
    id: "advert",
    icon: Megaphone,
    title: "Информация о рекламе",
    desc: "ФЗ-38 «О рекламе», ст. 5",
  },
  {
    id: "consumer",
    icon: Scale,
    title: "Права потребителей",
    desc: "ЗоЗПП ст. 7–10",
  },
];

export default function DocsSection() {
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  return (
    <>
      <section id="docs" className="py-24 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge variant="secondary" className="mb-4 px-4 py-1">Документы</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Документы и правовая информация</h2>
            <p className="text-muted-foreground">В соответствии с законодательством РФ</p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {DOCS.map((doc, i) => (
              <motion.button
                key={doc.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                onClick={() => setOpenDoc(doc.id)}
                className="text-left"
              >
                <Card className="p-5 h-full hover:shadow-md hover:border-amber-500/30 transition-all cursor-pointer group">
                  <div className="text-amber-500 mb-3 group-hover:scale-110 transition-transform">
                    <doc.icon className="h-8 w-8" />
                  </div>
                  <h3 className="font-semibold mb-1">{doc.title}</h3>
                  <p className="text-sm text-muted-foreground">{doc.desc}</p>
                  <span className="text-amber-600 text-sm font-medium mt-2 inline-block group-hover:underline">
                    Читать →
                  </span>
                </Card>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      <LegalModals openDoc={openDoc} onClose={() => setOpenDoc(null)} />
    </>
  );
}
