'use strict';

const {
  NetworkAddressTracker,
  chooseDefaultAddress,
  isAddressActive,
  resolveBindHost,
  resolveConnectHost
} = require('../src/network-address');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const addresses = [
  { address: '172.28.32.1', name: 'vEthernet (Default Switch)', internal: false },
  { address: '192.168.0.243', name: 'WLAN', internal: false },
  { address: '127.0.0.1', name: 'Loopback Pseudo-Interface 1', internal: true }
];

assert(chooseDefaultAddress(addresses, '') === '192.168.0.243', 'Physical LAN address must win over virtual adapters.');
assert(isAddressActive(addresses, '192.168.0.243'), 'Current WLAN address must be active.');
assert(!isAddressActive(addresses, '192.168.5.201'), 'Previous WLAN address must be inactive.');

const recovered = resolveConnectHost(addresses, '', '192.168.5.201');
assert(recovered.connectHost === '192.168.0.243', 'Inactive saved address must switch to current WLAN.');
assert(recovered.changed === true, 'Recovered address must report a change.');
assert(recovered.reason === 'saved_connect_host_unavailable', 'Recovered address reason is incorrect.');
assert(resolveBindHost(addresses, '', '192.168.5.201', recovered) === '0.0.0.0', 'Inactive saved bind address must become wildcard LAN binding.');
assert(resolveBindHost(addresses, '', '127.0.0.1', recovered) === '0.0.0.0', 'Loopback bind must be corrected when advertising a LAN address.');

const retained = resolveConnectHost(addresses, '', '192.168.0.243');
assert(retained.connectHost === '192.168.0.243' && retained.changed === false, 'Active saved address must be retained.');

const explicit = resolveConnectHost(addresses, '10.20.30.40', '192.168.5.201');
assert(explicit.connectHost === '10.20.30.40' && explicit.explicit === true, 'Explicit connect host must never be overridden.');

const hostname = resolveConnectHost(addresses, '', 'bridge.example.test');
assert(hostname.connectHost === 'bridge.example.test' && hostname.changed === false, 'Saved hostname must be retained.');

const virtualOnly = [
  { address: '172.28.32.1', name: 'vEthernet (Default Switch)', internal: false },
  { address: '127.0.0.1', name: 'Loopback', internal: true }
];
assert(chooseDefaultAddress(virtualOnly, '') === '127.0.0.1', 'Virtual-only adapters must not be advertised to a physical phone automatically.');

const tracker = new NetworkAddressTracker('192.168.5.201', 2);
assert(tracker.observe(addresses) === null, 'First network observation must not switch immediately.');
const runtimeChange = tracker.observe(addresses);
assert(runtimeChange !== null, 'Stable second network observation must switch the runtime address.');
assert(runtimeChange.previousHost === '192.168.5.201', 'Runtime change previous host is incorrect.');
assert(runtimeChange.nextHost === '192.168.0.243', 'Runtime change next host is incorrect.');
assert(tracker.observe(addresses) === null, 'Active runtime address must remain stable after switching.');

process.stdout.write('network address smoke ok\n');
