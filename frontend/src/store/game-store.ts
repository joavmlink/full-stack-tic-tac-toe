import { create } from 'zustand';
import { createMatch, finishMatch } from '../api/matches';
import { chooseAiMove } from '../game/ai';
import { createEmptyBoard, getWinner, isDraw, placeMark, type Board, type Line, type Mark } from '../game/logic';
import { MARK_DRAW_MS } from '../game/mark-animation';
import type { Winner } from '../types/match';
import { useSettingsStore } from './settings-store';

export type Player = 'you' | 'ai';
export type GameStatus = 'idle' | 'starting' | 'flipping' | 'playing' | 'finished' | 'error';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

/** Duration of the coin flip that decides who goes first. */
export const COIN_FLIP_MS = 1900;
// The AI never answers before the player's mark has finished drawing.
const AI_THINK_MIN_MS = Math.max(500, MARK_DRAW_MS);
const AI_THINK_EXTRA_MS = 300;
const SAVE_ATTEMPTS = 3;

interface GameState {
  status: GameStatus;
  matchId: number | null;
  board: Board;
  humanMark: Mark;
  aiMark: Mark;
  starter: Player | null;
  turn: Player;
  result: Winner | null;
  winningLine: Line | null;
  saveStatus: SaveStatus;
  error: string | null;

  startMatch: () => Promise<void>;
  playHuman: (index: number) => void;
  retrySave: () => Promise<void>;
  abandon: () => void;
}

// A single pending timer (coin flip or the AI "thinking").
let pendingTimer: ReturnType<typeof setTimeout> | undefined;

function schedule(fn: () => void, ms: number) {
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(fn, ms);
}

function cancelScheduled() {
  clearTimeout(pendingTimer);
  pendingTimer = undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');

export const useGameStore = create<GameState>()((set, get) => {
  /** If the board is over, finishes the match and returns true. */
  function settle(board: Board): boolean {
    const { humanMark } = get();
    const winner = getWinner(board);
    if (winner) {
      finish(winner.mark === humanMark ? 'You' : 'AI', winner.line);
      return true;
    }
    if (isDraw(board)) {
      finish('Draw', null);
      return true;
    }
    return false;
  }

  function finish(result: Winner, winningLine: Line | null) {
    cancelScheduled();
    set({ status: 'finished', result, winningLine });
    void saveResult();
  }

  async function saveResult() {
    const { matchId, result } = get();
    if (matchId === null || result === null) return;

    set({ saveStatus: 'saving' });
    for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt++) {
      try {
        await finishMatch(matchId, result);
        if (get().matchId === matchId) set({ saveStatus: 'saved' });
        return;
      } catch {
        if (get().matchId !== matchId) return;
        if (attempt < SAVE_ATTEMPTS) await sleep(600 * attempt);
      }
    }
    if (get().matchId === matchId) set({ saveStatus: 'failed' });
  }

  function scheduleAiMove() {
    const matchId = get().matchId;
    schedule(() => {
      const { status, turn, board, aiMark } = get();
      if (get().matchId !== matchId || status !== 'playing' || turn !== 'ai') return;

      const move = chooseAiMove(board, aiMark, useSettingsStore.getState().difficulty);
      const next = placeMark(board, move, aiMark);
      set({ board: next });
      if (settle(next)) return;

      // The turn passes to the player only once the AI's mark has finished drawing.
      schedule(() => {
        if (get().matchId === matchId && get().status === 'playing') set({ turn: 'you' });
      }, MARK_DRAW_MS);
    }, AI_THINK_MIN_MS + Math.random() * AI_THINK_EXTRA_MS);
  }

  return {
    status: 'idle',
    matchId: null,
    board: createEmptyBoard(),
    humanMark: 'X',
    aiMark: 'O',
    starter: null,
    turn: 'you',
    result: null,
    winningLine: null,
    saveStatus: 'idle',
    error: null,

    startMatch: async () => {
      // Avoids two simultaneous POSTs (e.g. StrictMode's double effect in development).
      if (get().status === 'starting') return;

      cancelScheduled();
      set({
        status: 'starting',
        matchId: null,
        board: createEmptyBoard(),
        starter: null,
        result: null,
        winningLine: null,
        saveStatus: 'idle',
        error: null,
      });

      let matchId: number;
      try {
        matchId = (await createMatch()).id;
      } catch (error) {
        set({ status: 'error', error: errorMessage(error) });
        return;
      }
      if (get().status !== 'starting') return; // abandoned while it was being created

      // 50/50 coin flip: whoever goes first plays X.
      const starter: Player = Math.random() < 0.5 ? 'you' : 'ai';
      set({
        matchId,
        starter,
        turn: starter,
        humanMark: starter === 'you' ? 'X' : 'O',
        aiMark: starter === 'ai' ? 'X' : 'O',
        status: 'flipping',
      });

      schedule(() => {
        if (get().matchId !== matchId) return;
        set({ status: 'playing' });
        if (starter === 'ai') scheduleAiMove();
      }, COIN_FLIP_MS);
    },

    playHuman: (index) => {
      const { status, turn, board, humanMark } = get();
      if (status !== 'playing' || turn !== 'you' || board[index] !== null) return;

      const next = placeMark(board, index, humanMark);
      set({ board: next });
      if (!settle(next)) {
        set({ turn: 'ai' });
        scheduleAiMove();
      }
    },

    retrySave: () => saveResult(),

    abandon: () => {
      // Don't touch anything while 'starting': StrictMode unmounts and remounts immediately.
      if (get().status === 'starting') return;
      cancelScheduled();
      set({ status: 'idle' });
    },
  };
});
