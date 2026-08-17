'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  VoiceManager,
  normalizeRetentionPolicy,
  normalizeRetentionSource,
  normalizeRetentionDuration
} = require('../src/voice-manager');

function readUtf8(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', '..', relativePath), 'utf8');
}

function main() {
  const unknownManager = new VoiceManager({
    sttEndpoint: 'https://voice.test/stt',
    ttsEndpoint: 'https://voice.test/tts',
    sttToken: 'secret-stt-token',
    ttsToken: 'secret-tts-token'
  });
  const unknownStatus = unknownManager.status();
  assert.strictEqual(unknownStatus.privacy.status, 'unknown');
  assert.strictEqual(unknownStatus.privacy.userNoticeRequired, true);
  assert.strictEqual(unknownStatus.privacy.speechToText.dataForwarded, true);
  assert.strictEqual(unknownStatus.privacy.textToSpeech.dataForwarded, true);
  assert.strictEqual(unknownStatus.privacy.speechToText.retention.policy, 'unknown');
  assert.strictEqual(unknownStatus.privacy.textToSpeech.retention.source, 'unknown');
  assert.ok(unknownStatus.warnings.includes('stt_retention_policy_unknown'));
  assert.ok(unknownStatus.warnings.includes('tts_retention_policy_unknown'));
  const unknownJson = JSON.stringify(unknownStatus);
  assert.strictEqual(unknownJson.includes('voice.test'), false);
  assert.strictEqual(unknownJson.includes('secret-stt-token'), false);
  assert.strictEqual(unknownJson.includes('secret-tts-token'), false);

  const declaredManager = new VoiceManager({
    sttEndpoint: 'https://voice.test/stt',
    ttsEndpoint: 'https://voice.test/tts',
    sttRetentionPolicy: {
      policy: 'retained',
      source: 'provider_declared',
      durationSeconds: 86400
    },
    ttsRetentionPolicy: {
      policy: 'not_retained',
      source: 'operator_declared'
    }
  });
  const declaredStatus = declaredManager.status();
  assert.strictEqual(declaredStatus.privacy.status, 'declared');
  assert.strictEqual(declaredStatus.privacy.userNoticeRequired, false);
  assert.strictEqual(declaredStatus.privacy.speechToText.retention.policy, 'retained');
  assert.strictEqual(declaredStatus.privacy.speechToText.retention.source, 'provider_declared');
  assert.strictEqual(declaredStatus.privacy.textToSpeech.retention.policy, 'not_retained');
  assert.strictEqual(declaredStatus.warnings.includes('tts_retention_policy_unknown'), false);

  const knownManager = new VoiceManager({
    sttEndpoint: 'https://voice.test/stt',
    ttsEndpoint: 'https://voice.test/tts',
    sttRetentionPolicy: {
      policy: 'retained',
      source: 'provider_declared',
      durationSeconds: 86400
    },
    ttsRetentionPolicy: 'ephemeral'
  });
  const knownStatus = knownManager.status();
  assert.strictEqual(knownStatus.privacy.status, 'declared');
  assert.strictEqual(knownStatus.privacy.userNoticeRequired, false);
  assert.strictEqual(knownStatus.privacy.speechToText.retention.durationSeconds, 86400);
  assert.strictEqual(knownStatus.privacy.textToSpeech.retention.policy, 'ephemeral');
  assert.strictEqual(knownStatus.warnings.length, 0);

  assert.strictEqual(normalizeRetentionPolicy('retained'), 'retained');
  assert.strictEqual(normalizeRetentionPolicy('stored_forever'), 'unknown');
  assert.strictEqual(normalizeRetentionSource('provider_declared', 'unknown'), 'provider_declared');
  assert.strictEqual(normalizeRetentionSource('https://secret.example/token', 'operator_declared'), 'operator_declared');
  assert.strictEqual(normalizeRetentionDuration(86400), 86400);
  assert.strictEqual(normalizeRetentionDuration(1.5), undefined);
  assert.strictEqual(normalizeRetentionDuration(-1), undefined);

  const managerSource = readUtf8('tools/agent-bridge/src/voice-manager.js');
  const serverSource = readUtf8('tools/agent-bridge/src/server.js');
  const modelsSource = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets');
  const pageSource = readUtf8('entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets');
  const zhSource = readUtf8('entry/src/main/resources/base/element/string.json');
  const enSource = readUtf8('entry/src/main/resources/en_US/element/string.json');
  assert.ok(managerSource.includes('readRetentionPolicy'), 'Bridge retention policy normalization must be present');
  assert.ok(managerSource.includes('userNoticeRequired'), 'Bridge privacy status must expose user notice requirement');
  assert.ok(managerSource.includes('voice.test') === false, 'Bridge source must not contain test endpoint data');
  assert.ok(serverSource.includes('voicePrivacyStatus: true'), 'Bridge feature flag must advertise privacy status');
  assert.ok(modelsSource.includes('AgentBridgeVoicePrivacyRecord'), 'App Voice privacy model must be typed');
  assert.ok(modelsSource.includes('parseVoiceRetentionPolicy'), 'App Voice retention parser must be present');
  assert.ok(pageSource.includes('requestVoiceStatus()'), 'App must request Voice status for the active Bridge');
  assert.ok(pageSource.includes('voiceRetentionRiskText()'), 'App must render unknown retention risk');
  assert.ok(zhSource.includes('agent_home_voice_retention_unknown'), 'Chinese Voice retention warning must be localized');
  assert.ok(enSource.includes('agent_home_voice_retention_unknown'), 'English Voice retention warning must be localized');

  console.log('voice retention smoke ok');
}

main();
