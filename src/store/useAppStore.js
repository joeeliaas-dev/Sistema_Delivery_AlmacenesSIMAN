// src/store/useAppStore.js  (dueño: P1)
// Estado local compartido: fecha de trabajo y motorista elegido en la Vista motorista.
// Los datos de Firestore NO viven aquí; cada pantalla usa los listen* de los servicios.
import { create } from 'zustand';
import { todayISO } from '../lib/dates';

export const useAppStore = create((set) => ({
  date: todayISO(),
  setDate: (date) => set({ date }),
}));
