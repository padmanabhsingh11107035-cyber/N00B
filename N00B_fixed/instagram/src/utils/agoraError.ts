// Turns an Agora connection failure into a message that actually points at the real cause — the SDK's
// own error when a tab is switched away from mid-connection ("OPERATION_ABORTED") looks identical to a
// real hang from the outside (both surface as the join promise never settling), so it was previously
// mislabeled as a camera/microphone permissions problem, sending people chasing the wrong fix.
export function friendlyAgoraError(err: unknown, fallback: string): string {
  const code = (err as { code?: string } | undefined)?.code;
  if (code === 'OPERATION_ABORTED') {
    return 'The connection was interrupted because this tab was switched away from (or the browser put it in the background). Keep this tab in view and try again.';
  }
  const text = err instanceof Error ? err.message : '';
  // the plain messages of the browser ("Requested device not found") say nothing to a person: say what to do
  if (code === 'DEVICE_NOT_FOUND' || /Requested device not found|NotFoundError/i.test(text)) return 'No camera or screen was found on this device. Plug one in (or pick the Camera / Screen option that your device has) and try again.';
  if (code === 'PERMISSION_DENIED' || /NotAllowedError|Permission denied/i.test(text)) return 'NOOB was not allowed to use the camera, microphone or screen. Allow it in your browser or phone settings and try again.';
  if (code === 'NOT_SUPPORTED' || /getDisplayMedia|not supported/i.test(text)) return 'This device or browser can not share its screen (phones usually can not). Use the Camera option instead.';
  return err instanceof Error ? err.message : fallback;
}
