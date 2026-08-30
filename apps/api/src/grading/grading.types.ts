/**
 * Above this, the AI's answer stands on its own; below it, a teacher looks.
 *
 * Set high on purpose. The cost of the two mistakes is not symmetric: a
 * flagged submission that did not need a human costs a minute of reading,
 * and an auto-approved one that did costs a wrong mark on a transcript. The
 * local keyword provider never reaches this, which is correct — word
 * overlap is evidence a topic was mentioned, never that it was answered.
 *
 * A per-course threshold belongs on GradingPipelineConfig, whose table
 * already exists and is deliberately not wired up in this slice.
 */
export const AUTO_APPROVE_CONFIDENCE = 0.85;
