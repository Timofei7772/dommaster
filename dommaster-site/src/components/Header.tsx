"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SITE, NAV_LINKS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Menu, X, Phone } from "lucide-react";

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <a href="#" className="text-2xl font-bold">
          Dom<span className="text-amber-500">Master</span>
        </a>

        <nav className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <a href={`tel:${SITE.phoneLink}`} className="text-sm font-semibold flex items-center gap-1 hover:text-amber-600">
            <Phone className="h-4 w-4 text-amber-500" /> {SITE.phone}
          </a>
          <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black" render={<a href="#contact" />}>
            Связаться
          </Button>
        </div>

        <button className="md:hidden" onClick={() => setOpen(!open)}>
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t overflow-hidden"
          >
            <div className="px-4 py-4 space-y-3">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block py-2 text-sm font-medium"
                >
                  {l.label}
                </a>
              ))}
              <hr className="my-3" />
              <a href={`tel:${SITE.phoneLink}`} className="block text-sm font-semibold">
                {SITE.phone}
              </a>
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black" render={<a href="#contact" onClick={() => setOpen(false)} />}>
                Связаться
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
