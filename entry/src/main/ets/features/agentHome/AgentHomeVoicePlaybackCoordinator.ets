/**
 * Keeps local and remote TTS initialization/playback callbacks bound to the
 * visible Agent Home host and connection epoch that started them.
 */
export class AgentHomeVoicePlaybackCoordinator {
  private generation: number = 0;
  private hostProfileId: string = '';
  private connectionEpoch: number = 0;
  private active: boolean = false;
  private playbackStarted: boolean = false;
  private playbackIdentity: string = '';

  begin(hostProfileId: string, connectionEpoch: number): number {
    this.hostProfileId = hostProfileId;
    this.connectionEpoch = connectionEpoch;
    this.generation = this.generation + 1;
    this.active = true;
    this.playbackStarted = false;
    this.playbackIdentity = '';
    return this.generation;
  }

  reset(hostProfileId: string, connectionEpoch: number): number {
    this.hostProfileId = hostProfileId;
    this.connectionEpoch = connectionEpoch;
    this.generation = this.generation + 1;
    this.active = false;
    this.playbackStarted = false;
    this.playbackIdentity = '';
    return this.generation;
  }

  invalidate(): number {
    this.generation = this.generation + 1;
    this.active = false;
    this.playbackStarted = false;
    this.playbackIdentity = '';
    return this.generation;
  }

  markPlaybackStarted(
    generation: number,
    hostProfileId: string,
    connectionEpoch: number,
    deliveryIdentity: string
  ): boolean {
    const normalizedIdentity: string = deliveryIdentity.trim();
    if (normalizedIdentity.length === 0 ||
      !this.isCurrent(generation, hostProfileId, connectionEpoch) ||
      this.playbackStarted) {
      return false;
    }
    this.playbackStarted = true;
    this.playbackIdentity = normalizedIdentity;
    return true;
  }

  complete(generation: number, hostProfileId: string, connectionEpoch: number): boolean {
    if (!this.isCurrent(generation, hostProfileId, connectionEpoch)) {
      return false;
    }
    this.generation = this.generation + 1;
    this.active = false;
    this.playbackStarted = false;
    this.playbackIdentity = '';
    return true;
  }

  isCurrent(generation: number, hostProfileId: string, connectionEpoch: number): boolean {
    return this.active && this.generation === generation &&
      this.hostProfileId === hostProfileId && this.connectionEpoch === connectionEpoch;
  }

  currentGeneration(): number {
    return this.generation;
  }

  isActive(): boolean {
    return this.active;
  }

  isPlaybackStarted(): boolean {
    return this.active && this.playbackStarted;
  }

  currentPlaybackIdentity(): string {
    return this.active && this.playbackStarted ? this.playbackIdentity : '';
  }
}
