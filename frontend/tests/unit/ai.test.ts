import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { bestMoves, chooseAiMove, type RandomFn } from '../../src/game/ai';
import {
  availableMoves,
  createEmptyBoard,
  getWinner,
  isDraw,
  otherMark,
  placeMark,
  type Board,
  type Cell,
  type Mark,
} from '../../src/game/logic';

function board(layout: string): Cell[] {
  return [...layout.replace(/\s/g, '')].map((c) => (c === '.' ? null : (c as Mark)));
}

/** Fixed random: always returns the same value. */
const fixed =
  (value: number): RandomFn =>
  () =>
    value;

/**
 * Walks through EVERY possible game where the human plays any move and the hard AI
 * answers. Returns how many games ended with each result.
 */
function exploreAllGames(aiMark: Mark, random: RandomFn) {
  const humanMark = otherMark(aiMark);
  const results = { ai: 0, human: 0, draw: 0 };

  const visit = (cells: Board, toMove: Mark) => {
    const winner = getWinner(cells);
    if (winner) {
      results[winner.mark === aiMark ? 'ai' : 'human']++;
      return;
    }
    if (isDraw(cells)) {
      results.draw++;
      return;
    }
    if (toMove === aiMark) {
      const move = chooseAiMove(cells, aiMark, 'hard', random);
      visit(placeMark(cells, move, aiMark), humanMark);
    } else {
      for (const move of availableMoves(cells)) visit(placeMark(cells, move, humanMark), aiMark);
    }
  };

  // X always goes first.
  visit(createEmptyBoard(), 'X');
  return results;
}

describe('Hard AI', () => {
  for (const [label, aiMark] of [
    ['when the AI goes first (X)', 'X'],
    ['when the human goes first (AI = O)', 'O'],
  ] as const) {
    for (const [randomLabel, random] of [
      ['the first optimal move', fixed(0)],
      ['the last optimal move', fixed(0.999)],
    ] as const) {
      test(`never loses ${label}, picking ${randomLabel}`, () => {
        const results = exploreAllGames(aiMark, random);
        assert.equal(results.human, 0, `the human won ${results.human} games`);
        assert.ok(results.ai + results.draw > 0);
      });
    }
  }

  test('wins immediately when it can', () => {
    // The AI (O) completes the middle column at 7 instead of blocking.
    const cells = board('XOX .OX ...');
    assert.equal(chooseAiMove(cells, 'O', 'hard', fixed(0)), 7);
  });

  test("blocks the opponent's immediate win", () => {
    // X threatens the top row at 2.
    const cells = board('XX. .O. ...');
    assert.deepEqual(bestMoves(cells, 'O'), [2]);
  });

  test('prefers winning now over prolonging the game', () => {
    const cells = board('OO. XX. X..');
    assert.deepEqual(bestMoves(cells, 'O'), [2]);
  });
});

describe('Normal AI', () => {
  test('with a low random value it plays the optimal move', () => {
    const cells = board('XX. .O. ...');
    assert.equal(chooseAiMove(cells, 'O', 'normal', fixed(0)), 2);
  });

  test('with a high random value it plays any square at random', () => {
    const cells = board('XX. .O. ...');
    // 0.99 → skips the optimal move and takes the last free square (8).
    assert.equal(chooseAiMove(cells, 'O', 'normal', fixed(0.99)), 8);
  });
});

describe('Easy AI', () => {
  test('always picks a free square', () => {
    const cells = board('XO. X.O .X.');
    const free = availableMoves(cells);
    for (let i = 0; i < 100; i++) {
      assert.ok(free.includes(chooseAiMove(cells, 'O', 'easy', fixed(i / 100))));
    }
  });
});

test('throws when no moves are available', () => {
  assert.throws(() => chooseAiMove(board('XOX XOO OXX'), 'O', 'hard'));
});
