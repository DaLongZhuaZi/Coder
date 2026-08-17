import { AgentHomeHostProfile } from './AgentHomeModels';
import { AgentHomeDaemonFleetQueryResult } from './AgentHomeDaemonFleetConnectionPool';

/**
 * App-local Daemon Fleet availability policy.
 *
 * The Fleet panel must not depend on the currently active Bridge's own
 * capability advertisement: each saved host profile is queried and operated
 * through its own independent connection, so an old or offline active host
 * must not hide other saved hosts that can still be queried. Visibility is
 * decided only by the App's local fleet orchestration capability and the
 * saved host profiles. Per-target write eligibility is still enforced by
 * each snapshot's fleetTargetSupported/rollingEligible gates before any
 * rolling write operation is executed.
 */
export class AgentHomeDaemonFleetAvailabilityPolicy {
  /**
   * Whether this App build ships the local fleet orchestration chain
   * (collect with bounded concurrency, preview, confirm and per-target
   * rolling execution). Kept as an explicit gate so future builds can
   * disable the surface without touching the page logic.
   */
  static appSupportsFleetOrchestration(): boolean {
    return true;
  }

  /**
   * Number of saved host profiles that can actually be queried for daemon
   * status (hostProfileId and endpoint must both be present).
   */
  static queryableProfileCount(profiles: Array<AgentHomeHostProfile>): number {
    let count: number = 0;
    for (let index = 0; index < profiles.length; index++) {
      const profile = profiles[index];
      if (profile.hostProfileId.length > 0 && profile.endpoint.length > 0) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * Fleet panel availability: App-local orchestration capability AND at
   * least one queryable saved host profile. No dependency on the currently
   * active Bridge connection or its capability advertisement.
   */
  static isFleetPanelAvailable(profiles: Array<AgentHomeHostProfile>): boolean {
    if (!AgentHomeDaemonFleetAvailabilityPolicy.appSupportsFleetOrchestration()) {
      return false;
    }
    return AgentHomeDaemonFleetAvailabilityPolicy.queryableProfileCount(profiles) > 0;
  }

  /**
   * True when the collected results cover exactly the current saved host
   * profiles (same hostProfileId set). Used to reject a stale collect batch
   * that started before host profiles changed, so old results can never
   * overwrite the current snapshot list.
   */
  static matchesCurrentProfiles(results: Array<AgentHomeDaemonFleetQueryResult>,
    profiles: Array<AgentHomeHostProfile>): boolean {
    if (results.length !== profiles.length) {
      return false;
    }
    for (let resultIndex = 0; resultIndex < results.length; resultIndex++) {
      let found: boolean = false;
      for (let profileIndex = 0; profileIndex < profiles.length; profileIndex++) {
        if (profiles[profileIndex].hostProfileId === results[resultIndex].hostProfileId) {
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }
    return true;
  }
}
