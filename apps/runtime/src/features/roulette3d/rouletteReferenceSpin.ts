export type RouletteReferenceSpinState = {
  startRotation: number;
  targetRotation: number;
  elapsed: number;
  duration: number;
};

export function advanceRouletteReferenceSpin(state: RouletteReferenceSpinState, deltaSeconds: number) {
  const frameDt = Number.isFinite(deltaSeconds) ? Math.min(Math.max(deltaSeconds, 0), 0.05) : 0;
  const elapsed = state.duration > 0
    ? Math.min(state.duration, state.elapsed + frameDt * 1000)
    : state.duration;
  const progress = state.duration > 0 ? elapsed / state.duration : 1;
  const easedProgress = 1 - (1 - progress) ** 3;
  const rotation = state.startRotation + (state.targetRotation - state.startRotation) * easedProgress;

  return { elapsed, rotation, done: elapsed >= state.duration };
}
