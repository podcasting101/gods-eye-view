import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOCCER_TIMELINE_DURATION_S,
  RUN_SPEED_MPS,
  evaluateSoccerTimeline,
} from './lisaStreetSoccer.js';

test('evaluateSoccerTimeline locks running displacement cleanly to Mixamo footfall cadence', () => {
  const s0 = evaluateSoccerTimeline(0.0);
  const s2 = evaluateSoccerTimeline(2.0);
  const s3 = evaluateSoccerTimeline(2.99);
  assert.equal(s0.lisaAnim, 'Run');
  assert.ok(Math.abs((s2.lisaX - s0.lisaX) - 2.0 * RUN_SPEED_MPS) < 0.01);
  assert.ok(s3.lisaX > -0.1 && s3.lisaX <= 0.0);
});

test('evaluateSoccerTimeline enforces official Throw-In, only celebrates Woot on goals, & Boys equalizes without boxing', () => {
  const kickParry = evaluateSoccerTimeline(3.2);
  assert.equal(kickParry.lisaAnim, 'Kick');
  assert.equal(kickParry.lisaLoop, false);

  const throwInReady = evaluateSoccerTimeline(7.5);
  assert.ok(throwInReady.girlClY > 9.0, 'Girls winger steps onto Bayou touchline for throw-in');
  assert.ok(throwInReady.ballY > 8.5, 'Ball held at touchline before throw-in');
  assert.equal(throwInReady.lisaAnim, 'Idle', 'No premature Woot celebration on parried shot');

  const girlsGoal = evaluateSoccerTimeline(12.6);
  assert.equal(girlsGoal.lisaScore, 1);

  const boysKick = evaluateSoccerTimeline(17.2);
  assert.equal(boysKick.paulAnim, 'Kick', 'Paul executes real soccer Kick (not boxing)');

  const boysGoal = evaluateSoccerTimeline(18.5);
  assert.equal(boysGoal.paulScore, 1);

  const loopEnd = evaluateSoccerTimeline(SOCCER_TIMELINE_DURATION_S - 0.001);
  const loopStart = evaluateSoccerTimeline(0.0);
  assert.ok(Math.abs(loopEnd.lisaX - loopStart.lisaX) < 0.05);
});
