import { createMatch, finishMatch } from '../api/matches';
import { createGameStore } from './create-game-store';

export type { GameStatus, Player, SaveStatus } from './create-game-store';
export { COIN_FLIP_MS } from './create-game-store';

export const useGameStore = createGameStore({ createMatch, finishMatch });
