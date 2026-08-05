import type { GradeInput, GradeResult } from "./types";

export async function gradeShiftverse(input: GradeInput): Promise<GradeResult> {
  // Shiftverse has its own custom grading API endpoint under /api/shiftverse/team/[teamNumber]/guess
  // This is just a stub to satisfy the GraderRegistry.
  return {
    correct: false,
    points: 0,
    meta: {
      note: "Shiftverse does not use the generic submission pipeline.",
      receivedPayload: input.payload
    }
  };
}
