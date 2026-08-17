import { ngfKeyStoreManagerFacade, securityToolkit } from 'ngf_framework';

export class AgentHomeCredentialWriteResult {
  ok: boolean;
  alias: string;
  digest: string;
  failureCategory: string;

  constructor(ok: boolean, alias: string, digest: string, failureCategory: string = '') {
    this.ok = ok;
    this.alias = alias;
    this.digest = digest;
    this.failureCategory = failureCategory;
  }
}

export class AgentHomeHostCredentialStore {
  async writeNew(hostProfileId: string, credential: string): Promise<AgentHomeCredentialWriteResult> {
    if (hostProfileId.length === 0 || credential.length === 0) {
      return new AgentHomeCredentialWriteResult(false, '', '', 'credential_required');
    }
    const alias = this.buildAlias(hostProfileId);
    const digest = await securityToolkit.shaHash(credential);
    const stored = await ngfKeyStoreManagerFacade.addSecret(alias, credential);
    if (!stored) {
      return new AgentHomeCredentialWriteResult(false, '', digest, 'asset_store_write_failed');
    }
    return new AgentHomeCredentialWriteResult(true, alias, digest);
  }

  async read(alias: string): Promise<string | null> {
    if (alias.length === 0) {
      return null;
    }
    return ngfKeyStoreManagerFacade.querySecret(alias);
  }

  async remove(alias: string): Promise<boolean> {
    if (alias.length === 0) {
      return true;
    }
    return ngfKeyStoreManagerFacade.removeSecret(alias);
  }

  private buildAlias(hostProfileId: string): string {
    const randomText = securityToolkit.generateRandomBase64(18);
    let safeRandom = '';
    for (let index = 0; index < randomText.length; index++) {
      const ch = randomText.charAt(index);
      const code = ch.charCodeAt(0);
      const alpha = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
      const digit = code >= 48 && code <= 57;
      if (alpha || digit) {
        safeRandom = safeRandom + ch;
      }
    }
    if (safeRandom.length === 0) {
      safeRandom = String(Date.now());
    }
    return 'ngf_agent_bridge_host_' + hostProfileId + '_' + safeRandom;
  }
}

export const agentHomeHostCredentialStore: AgentHomeHostCredentialStore = new AgentHomeHostCredentialStore();
