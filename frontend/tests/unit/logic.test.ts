import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  WIN_LINES,
  availableMoves,
  createEmptyBoard,
  getWinner,
  isDraw,
  otherMark,
  placeMark,
  type Cell,
} from '../../src/game/logic';

/** Builds a board from a 9-character string: "X", "O" or "." (empty). */
function board(layout: string): Cell[] {
  const cells = layout.replace(/\s/g, '');
  assert.equal(cells.length, 9);
  return [...cells].map((c) => (c === '.' ? null : (c as 'X' | 'O')));
}

describe('getWinner', () => {
  test('an empty board has no winner', () => {
    assert.equal(getWinner(createEmptyBoard()), null);
  });

  for (const line of WIN_LINES) {
    test(`detects the line ${line.join('-')}`, () => {
      const cells = createEmptyBoard();
      for (const index of line) cells[index] = 'O';
      assert.deepEqual(getWinner(cells), { mark: 'O', line });
    });
  }

  test('does not count lines with mixed marks', () => {
    assert.equal(getWinner(board('XOX .O. ...')), null);
  });
});

describe('isDraw', () => {
  test('a full board without a winner is a draw', () => {
    assert.equal(isDraw(board('XOX XOO OXX')), true);
  });

  test('a full board with a winner is not a draw', () => {
    assert.equal(isDraw(board('XXX OOX OXO')), false);
  });

  test('an incomplete board is not a draw', () => {
    assert.equal(isDraw(board('XOX XOO OX.')), false);
  });
});

describe('availableMoves', () => {
  test('lists the empty squares in order', () => {
    assert.deepEqual(availableMoves(board('X.O .X. ..O')), [1, 3, 5, 6, 7]);
  });

  test('a full board has no moves', () => {
    assert.deepEqual(availableMoves(board('XOX XOO OXX')), []);
  });
});

describe('placeMark', () => {
  test('returns a new board without modifying the original', () => {
    const original = createEmptyBoard();
    const next = placeMark(original, 4, 'X');
    assert.equal(next[4], 'X');
    assert.equal(original[4], null);
    assert.notEqual(next, original);
  });

  test('rejects taken or out-of-range squares', () => {
    const cells = board('X.. ... ...');
    assert.throws(() => placeMark(cells, 0, 'O'));
    assert.throws(() => placeMark(cells, -1, 'O'));
    assert.throws(() => placeMark(cells, 9, 'O'));
  });
});

test('otherMark alternates X and O', () => {
  assert.equal(otherMark('X'), 'O');
  assert.equal(otherMark('O'), 'X');
});
