'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureDeviceIdentity, signConnectionChallenge } = require('../src/device-identity');

const profile = ensureDeviceIdentity({});
const proof = signConnectionChallenge(
  profile,
  'ws://127.0.0.1:17666/ws',
  'harmony-coder-app',
  'app-nonce-smoke'
);
const signature = Buffer.from(proof.signature.signature, 'base64');

if (proof.signature.curve !== 'ECC256') {
  throw new Error('Unexpected signature curve: ' + proof.signature.curve);
}
if (proof.signature.encoding !== 'asn1-der') {
  throw new Error('Unexpected signature encoding: ' + proof.signature.encoding);
}
if (proof.signature.verifier !== 'ECC256|SHA256') {
  throw new Error('Unexpected signature verifier: ' + proof.signature.verifier);
}
if (signature.length === 0 || signature[0] !== 0x30) {
  throw new Error('ECDSA signature is not ASN.1 DER encoded');
}

const verifier = crypto.createVerify('SHA256');
verifier.update(proof.signature.material);
verifier.end();

if (!verifier.verify(proof.deviceIdentity.publicKeyPem, signature)) {
  throw new Error('Node ECDSA verification failed');
}

const previousHome = process.env.AGENT_BRIDGE_HOME;
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-agent-bridge-identity-'));
try {
  process.env.AGENT_BRIDGE_HOME = tempHome;
  const { loadProfile, saveProfile } = require('../src/profile-store');
  const firstSaved = saveProfile({
    port: 8788,
    token: 'identity-smoke-token'
  });
  const secondSaved = saveProfile({
    port: 8789,
    token: 'identity-smoke-token'
  });
  const reloaded = loadProfile();
  if (!reloaded) {
    throw new Error('Saved profile could not be reloaded');
  }
  if (
    secondSaved.physicalDeviceId !== firstSaved.physicalDeviceId ||
    secondSaved.bridgeInstanceId !== firstSaved.bridgeInstanceId ||
    secondSaved.devicePublicKeyPem !== firstSaved.devicePublicKeyPem ||
    secondSaved.devicePrivateKeyPem !== firstSaved.devicePrivateKeyPem ||
    secondSaved.deviceKeyFingerprint !== firstSaved.deviceKeyFingerprint ||
    reloaded.deviceKeyFingerprint !== firstSaved.deviceKeyFingerprint
  ) {
    throw new Error('Device identity changed while saving ordinary profile settings');
  }
  const ordinaryProfile = JSON.parse(fs.readFileSync(path.join(tempHome, 'profile.json'), 'utf8'));
  if (Object.keys(ordinaryProfile).includes('devicePrivateKeyPem')) {
    throw new Error('Ordinary profile persisted the device private key');
  }
  if (Object.keys(secondSaved).includes('devicePrivateKeyPem')) {
    throw new Error('In-memory profile exposed the device private key as enumerable data');
  }
  const relayIdentityPath = path.join(tempHome, 'security', 'relay-identity.json');
  if (!fs.existsSync(relayIdentityPath)) {
    throw new Error('Restricted relay identity store was not created');
  }
} finally {
  if (typeof previousHome === 'string') {
    process.env.AGENT_BRIDGE_HOME = previousHome;
  } else {
    delete process.env.AGENT_BRIDGE_HOME;
  }
  fs.rmSync(tempHome, { recursive: true, force: true });
}

console.log('device identity smoke passed: der=true verify=true persistent=true privateKeyIsolated=true');
