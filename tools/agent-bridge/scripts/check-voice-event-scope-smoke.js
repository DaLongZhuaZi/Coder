'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { VoiceManager } = require('../src/voice-manager');
const { sendScopedVoiceEvent } = require('../src/voice-event-router');

function audio(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

async function main() {
  const events = [];
  const manager = new VoiceManager({
    sttEndpoint: 'https://voice.test/stt',
    ttsEndpoint: 'https://voice.test/tts',
    requestJson: async (endpoint) => endpoint.endsWith('/stt')
      ? { partialTranscript: 'partial', transcript: 'final' }
      : { audioBase64: audio('audio'), mimeType: 'audio/mpeg', sampleRate: 24000, channels: 1 },
    onUpdated: (event) => events.push(event)
  });

  const start = manager.start({ mimeType: 'audio/pcm', sampleRate: 16000 }, 'owner-a');
  assert.strictEqual(start.ok, true);
  const sessionId = start.session.id;
  manager.chunk({ sessionId, sequence: 0, vadState: 'speech', audioBase64: audio('pcm') }, 'owner-a');
  await manager.finish({ sessionId }, 'owner-a');
  await manager.speak({ text: 'hello', clientRequestId: 'scope-a' }, 'owner-a');

  const ownedEvents = events.filter((event) => event.ownerId === 'owner-a');
  assert.ok(ownedEvents.some((event) => event.kind === 'transcript.partial'));
  assert.ok(ownedEvents.some((event) => event.kind === 'transcript.final'));
  assert.ok(ownedEvents.some((event) => event.kind === 'vad.changed'));
  assert.ok(ownedEvents.some((event) => event.kind === 'tts.ready'));
  assert.strictEqual(events.some((event) => event.ownerId !== 'owner-a'), false);

  const deliveredA = [];
  const deliveredB = [];
  const connections = new Set([
    { connectionId: 'owner-a', sendJson: (message) => deliveredA.push(message) },
    { connectionId: 'owner-b', sendJson: (message) => deliveredB.push(message) }
  ]);
  const publicMessage = { type: 'event', payload: { transcript: 'final' } };
  assert.strictEqual(sendScopedVoiceEvent(connections, 'owner-a', publicMessage), 1);
  assert.deepStrictEqual(deliveredA, [publicMessage]);
  assert.deepStrictEqual(deliveredB, []);
  assert.strictEqual(sendScopedVoiceEvent(connections, '', publicMessage), 0);

  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  assert.ok(serverSource.includes("sendScopedVoiceEvent(\n      activeWsConnections"), 'server should route Voice events through the owner-scoped router');
  assert.ok(serverSource.includes('delete publicEvent.ownerId;'), 'server should strip internal Voice owner metadata');
  assert.strictEqual(serverSource.includes("broadcastToClients(makeEvent(eventType, readString(event, 'sessionId', ''), event))"), false, 'Voice events must not use global broadcast');

  manager.shutdown();
  console.log('voice event scope smoke ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
