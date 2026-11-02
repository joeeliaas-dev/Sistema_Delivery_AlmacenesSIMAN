// src/store/dateStore.js  (dueño: P1)
// Fecha de trabajo del despacho. Es la misma de useAppStore (una sola fuente de verdad).
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from './useAppStore';

/** @returns {{ date: string, setDate: (date: string) => void }}  por defecto, hoy */
export const useDateStore = () => useAppStore(useShallow((s) => ({ date: s.date, setDate: s.setDate })));
