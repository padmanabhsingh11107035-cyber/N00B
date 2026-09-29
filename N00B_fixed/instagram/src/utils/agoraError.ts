// Turns an Agora connection failure into a message that actually points at the real cause — the SDK's
// own error when a tab is switched away from mid-connection ("OPERATION_ABORTED") looks identical to a
// real hang from the outside (both surface as the join promise never settling), so it was previously
// mislabeled as a camera/microphone permissions problem, sending people chasing the wrong fix.
export function friendlyAgoraError(err: unknown, fallback: string): string {
  const code = (err as { code?: string } | undefined)?.code;
  if (code === 'OPERATION_ABORTED') {
    return 'The connection was interrupted because this tab was switched away from (or the browser put it in the background). Keep this tab in view and try again.';
  }
  return err instanceof Error ? err.message : fallback;
}
