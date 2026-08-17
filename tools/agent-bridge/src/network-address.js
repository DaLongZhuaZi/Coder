'use strict';

const net = require('net');
const os = require('os');

function listIPv4Addresses() {
  const results = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const entries = interfaces[name] || [];
    for (const entry of entries) {
      if (entry.family !== 'IPv4' && entry.family !== 4) {
        continue;
      }
      results.push({
        address: entry.address,
        name,
        internal: entry.internal === true
      });
    }
  }
  return results;
}

function isLoopbackHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function isAddressActive(addresses, host) {
  const normalized = String(host || '').trim();
  if (isLoopbackHost(normalized)) {
    return true;
  }
  for (const item of addresses || []) {
    if (item && item.address === normalized) {
      return true;
    }
  }
  return false;
}

function isLikelyVirtualInterface(name) {
  const normalized = String(name || '').toLowerCase();
  const markers = [
    'vethernet',
    'virtual',
    'vmware',
    'virtualbox',
    'hyper-v',
    'wsl',
    'docker',
    'loopback',
    'bluetooth'
  ];
  for (const marker of markers) {
    if (normalized.indexOf(marker) >= 0) {
      return true;
    }
  }
  return false;
}

function usableLanAddresses(addresses) {
  const results = [];
  for (const item of addresses || []) {
    if (!item || item.internal === true || net.isIP(item.address) !== 4 || item.address.startsWith('169.254.')) {
      continue;
    }
    results.push(item);
  }
  return results;
}

function chooseDefaultAddress(addresses, preferredAddress) {
  const preferred = String(preferredAddress || '').trim();
  if (preferred.length > 0 && (net.isIP(preferred) !== 4 || isAddressActive(addresses, preferred))) {
    return preferred;
  }
  const usable = usableLanAddresses(addresses);
  for (const item of usable) {
    if (!isLikelyVirtualInterface(item.name)) {
      return item.address;
    }
  }
  return '127.0.0.1';
}

function resolveConnectHost(addresses, explicitHost, savedHost) {
  const explicit = String(explicitHost || '').trim();
  const saved = String(savedHost || '').trim();
  if (explicit.length > 0) {
    return {
      connectHost: explicit,
      previousHost: saved,
      changed: false,
      explicit: true,
      reason: 'explicit_connect_host'
    };
  }
  if (saved.length > 0 && (net.isIP(saved) !== 4 || isAddressActive(addresses, saved))) {
    return {
      connectHost: saved,
      previousHost: saved,
      changed: false,
      explicit: false,
      reason: 'saved_connect_host_active'
    };
  }
  const selected = chooseDefaultAddress(addresses, '');
  return {
    connectHost: selected,
    previousHost: saved,
    changed: saved.length > 0 && saved !== selected,
    explicit: false,
    reason: saved.length > 0 ? 'saved_connect_host_unavailable' : 'connect_host_detected'
  };
}

function bindHostForConnectHost(connectHost) {
  return isLoopbackHost(connectHost) ? '127.0.0.1' : '0.0.0.0';
}

function resolveBindHost(addresses, explicitBindHost, savedBindHost, hostSelection) {
  const explicit = String(explicitBindHost || '').trim();
  if (explicit.length > 0) {
    return explicit;
  }
  const saved = String(savedBindHost || '').trim();
  if (saved.length === 0) {
    return bindHostForConnectHost(hostSelection.connectHost);
  }
  if (saved === '0.0.0.0' || saved === '::') {
    return saved;
  }
  if (net.isIP(hostSelection.connectHost) === 4 && !isLoopbackHost(hostSelection.connectHost) && isLoopbackHost(saved)) {
    return '0.0.0.0';
  }
  if (hostSelection.changed || (net.isIP(saved) === 4 && !isAddressActive(addresses, saved))) {
    return bindHostForConnectHost(hostSelection.connectHost);
  }
  return saved;
}

class NetworkAddressTracker {
  constructor(connectHost, stableObservations) {
    this.connectHost = String(connectHost || '').trim();
    this.stableObservations = Math.max(1, Number.isFinite(stableObservations) ? Math.floor(stableObservations) : 2);
    this.pendingHost = '';
    this.pendingObservations = 0;
  }

  observe(addresses) {
    if (isAddressActive(addresses, this.connectHost)) {
      this.pendingHost = '';
      this.pendingObservations = 0;
      return null;
    }
    const nextHost = chooseDefaultAddress(addresses, '');
    if (isLoopbackHost(nextHost) || nextHost === this.connectHost) {
      return null;
    }
    if (this.pendingHost !== nextHost) {
      this.pendingHost = nextHost;
      this.pendingObservations = 1;
      return null;
    }
    this.pendingObservations = this.pendingObservations + 1;
    if (this.pendingObservations < this.stableObservations) {
      return null;
    }
    const previousHost = this.connectHost;
    this.connectHost = nextHost;
    this.pendingHost = '';
    this.pendingObservations = 0;
    return {
      previousHost,
      nextHost,
      reason: 'runtime_network_changed'
    };
  }
}

module.exports = {
  NetworkAddressTracker,
  bindHostForConnectHost,
  chooseDefaultAddress,
  isAddressActive,
  isLikelyVirtualInterface,
  isLoopbackHost,
  listIPv4Addresses,
  resolveBindHost,
  resolveConnectHost,
  usableLanAddresses
};
