import type { GradeInput, GradeResult } from "./types";

/**
 * CODE — the only asynchronous grader.
 *
 * This does NOT run the submission. It hands the work to the judge subsystem
 * and returns `pending`, so the pipeline replies 202 and the client polls.
 * Running untrusted code inside this container would put a stranger's process
 * next to the database credentials and the JWT signing key — the whole reason
 * judges are separate, network-isolated, ephemeral containers.
 *
 * STUB: enqueue is not wired yet. Implementing it means
 *   1. write the source to Blob Storage, keep the ref
 *   2. push { submissionId } onto the Storage Queue
 *   3. KEDA scales Container Apps Jobs on queue depth (0 → N)
 *   4. the judge writes a result blob; a callback finalises the verdict
 */
export async function gradeCode(_input: GradeInput): Promise<GradeResult> {
  void _input;
  return {
    correct: false,
    points: 0,
    pending: true,
    meta: { queued: false, note: "judge subsystem not yet implemented" },
  };
}
