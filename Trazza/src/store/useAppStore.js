import { create } from 'zustand';
import { todayISO } from '../lib/dates';
export const useAppStore = create((set) => ({
  date: todayISO(),
  currentDriverId: 'D2',
  setCurrentDriverId: (currentDriverId) =>
    set({
      currentDriverId,
    }),
  setDate: (date) =>
    set({
      date,
    }),
}));
