import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Difficulty } from '../game/ai';

interface SettingsState {
  difficulty: Difficulty;
  setDifficulty: (difficulty: Difficulty) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      difficulty: 'normal',
      setDifficulty: (difficulty) => set({ difficulty }),
    }),
    { name: 'tic-tac-toe-settings' },
  ),
);
