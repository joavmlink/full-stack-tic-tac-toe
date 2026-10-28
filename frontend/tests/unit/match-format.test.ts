import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { formatDuration, formatMatchDate, resultInfo, toMatchStats } from '../../src/lib/match-format';
import { nextCursorFromLink } from '../../src/lib/pagination';

describe('formatDuration', () => {
  test('under a minute', () => {
    assert.equal(formatDuration('2026-10-26T11:30:00.000-03:00', '2026-10-26T11:30:42.400-03:00'), '42s');
  });

  test('minutes and two-digit seconds', () => {
    assert.equal(formatDuration('2026-10-26T11:30:00.000-03:00', '2026-10-26T11:31:05.000-03:00'), '1m 05s');
  });

  test('null when the match is unfinished', () => {
    assert.equal(formatDuration('2026-10-26T11:30:00.000-03:00', null), null);
  });
});

test('formatMatchDate shows Argentina time in English', () => {
  const text = formatMatchDate('2026-10-26T11:30:00.000-03:00');
  assert.match(text, /Oct/);
  assert.match(text, /26/);
  assert.match(text, /2026/);
  assert.match(text, /11:30/);
});

test('toMatchStats computes the win rate over finished matches', () => {
  assert.deepEqual(toMatchStats({ wins: 2, losses: 1, draws: 1 }), {
    wins: 2,
    losses: 1,
    draws: 1,
    finished: 4,
    winRate: 50,
  });
});

test('toMatchStats with no finished matches', () => {
  assert.deepEqual(toMatchStats({ wins: 0, losses: 0, draws: 0 }), {
    wins: 0,
    losses: 0,
    draws: 0,
    finished: 0,
    winRate: 0,
  });
});

describe('nextCursorFromLink', () => {
  test('reads the cursor of the next page', () => {
    assert.equal(nextCursorFromLink('</api/matches?limit=20&before=42>; rel="next"'), 42);
    assert.equal(nextCursorFromLink('</api/matches?before=7&limit=20>; rel="next"'), 7);
  });

  test('null without a next link', () => {
    assert.equal(nextCursorFromLink(null), null);
    assert.equal(nextCursorFromLink(''), null);
    assert.equal(nextCursorFromLink('</api/matches?before=3>; rel="prev"'), null);
  });
});

test('resultInfo labels every result', () => {
  assert.equal(resultInfo('You').label, 'Win');
  assert.equal(resultInfo('AI').label, 'Loss');
  assert.equal(resultInfo('Draw').label, 'Draw');
  assert.equal(resultInfo(null).label, 'Unfinished');
});
