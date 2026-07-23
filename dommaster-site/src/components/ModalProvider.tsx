"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import LegalModals from "@/components/LegalModals";

type ModalContextType = {
  openModal: (id: string) => void;
};

const ModalContext = createContext<ModalContextType>({ openModal: () => {} });

export const useLegalModal = () => useContext(ModalContext);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  return (
    <ModalContext.Provider value={{ openModal: setOpenDoc }}>
      {children}
      <LegalModals openDoc={openDoc} onClose={() => setOpenDoc(null)} />
    </ModalContext.Provider>
  );
}
