/** Durations of the mark drawing animation (see MarkIcon). */
export const X_STROKE_S = 0.14;
export const X_SECOND_STROKE_DELAY_S = 0.1;
export const O_DRAW_S = 0.25;

/** Time until any mark finishes drawing. */
export const MARK_DRAW_MS = Math.max(X_SECOND_STROKE_DELAY_S + X_STROKE_S, O_DRAW_S) * 1000;
