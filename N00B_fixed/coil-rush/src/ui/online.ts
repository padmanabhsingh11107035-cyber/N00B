/**
 * Shared score submission is disabled for this offline build; personal records remain local.
 * These no-network lifecycle methods preserve game hooks without sending player data anywhere.
 */
export type OnlineStatus = 'off'
export type OnlineOutcome = { status: OnlineStatus }

export class Online {
  beginLife(_optIn: boolean, _name: string, _unranked: boolean): void {
    // Offline mode: never creates a remote run ticket.
  }

  async endLife(_optIn: boolean, _unranked: boolean, _peakLength: number, _durationMs: number): Promise<OnlineOutcome> {
    return { status: 'off' }
  }
}
