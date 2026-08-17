'use strict';

const crypto = require('crypto');

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_CHUNK_BYTES = 256 * 1024;
const DEFAULT_MAX_SESSION_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 12 * 1024 * 1024;
const DEFAULT_MAX_CHUNKS_PER_SECOND = 30;
const DEFAULT_MAX_TTS_TEXT_LENGTH = 8000;
const DEFAULT_TTS_FORMAT = 'audio/mpeg';
const MAX_RETENTION_SECONDS = 10 * 365 * 24 * 60 * 60;
const RETENTION_POLICIES = new Set(['unknown', 'not_retained', 'ephemeral', 'retained']);
const RETENTION_SOURCES = new Set(['unknown', 'provider_declared', 'operator_declared']);
const MAX_VOICE_LANGUAGE_LENGTH = 64;
const MAX_VOICE_ID_LENGTH = 128;
const MAX_VOICE_CLIENT_REQUEST_ID_LENGTH = 160;
const MAX_TRANSCRIPT_LENGTH = 64 * 1024;
const MAX_PARTIAL_TRANSCRIPT_LENGTH = 16 * 1024;
const MIN_SAMPLE_RATE = 8000;
const MAX_SAMPLE_RATE = 192000;
const MAX_CHANNELS = 2;
const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/aac',
  'audio/flac',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/opus',
  'audio/pcm',
  'audio/raw',
  'audio/wav',
  'audio/webm',
  'audio/x-wav'
]);
const PROVIDER_FAILURE_MESSAGES = Object.freeze({
  voice_cancelled: 'Voice Provider request was cancelled.',
  voice_provider_http_error: 'Voice Provider returned an unsuccessful response.',
  voice_provider_response_invalid: 'Voice Provider returned an invalid response.',
  voice_provider_response_too_large: 'Voice Provider response exceeded the size limit.',
  voice_provider_timeout: 'Voice Provider request timed out.',
  voice_transcript_empty: 'Voice Provider returned no transcript.',
  voice_transcript_too_large: 'Voice Provider transcript exceeded the size limit.',
  voice_tts_audio_invalid: 'Text to speech Provider returned invalid audio.',
  voice_tts_audio_profile_invalid: 'Text to speech Provider returned an invalid audio profile.',
  voice_tts_format_unsupported: 'Text to speech Provider returned an unsupported audio format.'
});
const PROVIDER_FAILURE_CATEGORIES = new Set(Object.keys(PROVIDER_FAILURE_MESSAGES).concat(['voice_provider_failed']));

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function readString(source, key, fallbackValue) {
  const value = objectValue(source)[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function readNumber(source, key, fallbackValue) {
  const value = objectValue(source)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
}

function readOptionalNumber(source, key) {
  const value = objectValue(source)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function boundedInteger(value, fallbackValue, minimum, maximum) {
  const candidate = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallbackValue;
  return Math.min(Math.max(candidate, minimum), maximum);
}

function randomId(prefix) {
  return prefix + '_' + (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
}

function nowIso(nowMs) {
  return new Date(nowMs).toISOString();
}

function publicFailure(action, failureCategory, message, remediation) {
  return {
    ok: false,
    action,
    failureCategory,
    message,
    remediation: typeof remediation === 'string' ? remediation : '',
    updatedAt: new Date().toISOString()
  };
}

function endpointFromEnvironment(name) {
  const value = typeof process.env[name] === 'string' ? process.env[name].trim() : '';
  return normalizeEndpoint(value).url;
}

function normalizeEndpoint(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { url: '', invalid: false };
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      return { url: '', invalid: true };
    }
    return { url: url.toString(), invalid: false };
  } catch (_error) {
    return { url: '', invalid: true };
  }
}

function readBoolean(source, key, fallbackValue) {
  const value = objectValue(source)[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function normalizeRetentionPolicy(value) {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return RETENTION_POLICIES.has(candidate) ? candidate : 'unknown';
}

function normalizeRetentionSource(value, fallbackValue) {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return RETENTION_SOURCES.has(candidate) ? candidate : fallbackValue;
}

function normalizeRetentionDuration(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > MAX_RETENTION_SECONDS) {
    return undefined;
  }
  return value;
}

function readRetentionPolicy(config, key, environmentName) {
  const options = objectValue(config);
  const hasConfiguredValue = Object.keys(options).includes(key);
  const rawValue = hasConfiguredValue ? options[key] : process.env[environmentName];
  let policyValue = '';
  let sourceValue = '';
  let durationValue;
  if (typeof rawValue === 'string') {
    policyValue = rawValue;
    sourceValue = hasConfiguredValue ? 'operator_declared' : 'operator_declared';
  } else {
    const rawObject = objectValue(rawValue);
    policyValue = readString(rawObject, 'policy', '');
    sourceValue = readString(rawObject, 'source', '');
    durationValue = readOptionalNumber(rawObject, 'durationSeconds');
  }
  const policy = normalizeRetentionPolicy(policyValue);
  const source = policy === 'unknown'
    ? 'unknown'
    : normalizeRetentionSource(sourceValue, 'operator_declared');
  const durationSeconds = normalizeRetentionDuration(durationValue);
  return { policy, source, durationSeconds };
}

function publicRetentionPolicy(policy) {
  const result = { policy: policy.policy, source: policy.source };
  if (policy.durationSeconds !== undefined) {
    result.durationSeconds = policy.durationSeconds;
  }
  return result;
}

function tokenForEnvironment(nameVariable, fallbackName) {
  const configuredName = typeof process.env[nameVariable] === 'string' && process.env[nameVariable].trim().length > 0
    ? process.env[nameVariable].trim()
    : fallbackName;
  return typeof process.env[configuredName] === 'string' ? process.env[configuredName] : '';
}

function decodeAudioBase64(value, maximumBytes) {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(maximumBytes * 4 / 3) + 8) {
    return null;
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    return null;
  }
  const buffer = Buffer.from(value, 'base64');
  if (buffer.length === 0 || buffer.length > maximumBytes) return null;
  const normalizedInput = value.replace(/=+$/g, '');
  const normalizedOutput = buffer.toString('base64').replace(/=+$/g, '');
  return normalizedInput === normalizedOutput ? buffer : null;
}

function normalizeAudioMimeType(value, fallbackValue) {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const aliases = {
    aac: 'audio/aac',
    flac: 'audio/flac',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    opus: 'audio/opus',
    pcm: 'audio/pcm',
    raw: 'audio/raw',
    wav: 'audio/wav',
    webm: 'audio/webm'
  };
  const normalized = Object.prototype.hasOwnProperty.call(aliases, candidate) ? aliases[candidate] : candidate;
  if (SUPPORTED_AUDIO_MIME_TYPES.has(normalized)) return normalized;
  return fallbackValue;
}

function normalizeSafeText(value, maximumLength, trimValue) {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  const normalized = trimValue === false ? cleaned : cleaned.trim();
  return normalized.length <= maximumLength ? normalized : null;
}

function normalizeVoiceLanguage(value) {
  const normalized = normalizeSafeText(value, MAX_VOICE_LANGUAGE_LENGTH, true);
  if (normalized === null || normalized.length === 0) return normalized === null ? null : '';
  return /^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/.test(normalized) ? normalized : null;
}

function normalizeVoiceId(value) {
  const normalized = normalizeSafeText(value, MAX_VOICE_ID_LENGTH, true);
  if (normalized === null) return null;
  return normalized;
}

function normalizeVoiceClientRequestId(value) {
  const normalized = normalizeSafeText(value, MAX_VOICE_CLIENT_REQUEST_ID_LENGTH, true);
  if (normalized === null) return null;
  if (normalized.length === 0) return '';
  return /^[A-Za-z0-9._:-]+$/.test(normalized) ? normalized : null;
}

function normalizeAudioProfile(source, action) {
  const requestedMime = readString(source, 'mimeType', 'audio/pcm');
  const mimeType = normalizeAudioMimeType(requestedMime, '');
  if (!mimeType) {
    return publicFailure(action, 'voice_mime_unsupported', 'Audio MIME type is not supported.', 'Use an advertised audio format and retry.');
  }
  const sampleRateValue = readOptionalNumber(source, 'sampleRate');
  const sampleRate = sampleRateValue === undefined ? 16000 : sampleRateValue;
  if (!Number.isInteger(sampleRate) || sampleRate < MIN_SAMPLE_RATE || sampleRate > MAX_SAMPLE_RATE) {
    return publicFailure(action, 'voice_sample_rate_invalid', 'Audio sample rate is invalid.', 'Use an integer sample rate between 8000 and 192000 Hz.');
  }
  const channelsValue = readOptionalNumber(source, 'channels');
  const channels = channelsValue === undefined ? 1 : channelsValue;
  if (!Number.isInteger(channels) || channels < 1 || channels > MAX_CHANNELS) {
    return publicFailure(action, 'voice_channels_invalid', 'Audio channel count is invalid.', 'Use one or two audio channels.');
  }
  const sampleBitsValue = readOptionalNumber(source, 'sampleBits');
  const sampleBits = sampleBitsValue === undefined ? 16 : sampleBitsValue;
  if (!Number.isInteger(sampleBits) || ![8, 16, 24, 32].includes(sampleBits)) {
    return publicFailure(action, 'voice_sample_bits_invalid', 'Audio sample depth is invalid.', 'Use 8, 16, 24, or 32 bits per sample.');
  }
  return { ok: true, mimeType, sampleRate, channels, sampleBits };
}

function providerFailure(action, error, remediation) {
  const requestedCode = error && typeof error.code === 'string' ? error.code : '';
  const failureCategory = PROVIDER_FAILURE_CATEGORIES.has(requestedCode) ? requestedCode : 'voice_provider_failed';
  return publicFailure(
    action,
    failureCategory,
    PROVIDER_FAILURE_MESSAGES[failureCategory] || 'Voice Provider request failed.',
    remediation
  );
}

async function defaultJsonRequest(endpoint, token, payload, timeoutMs, maximumResponseBytes, signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortListener = () => controller.abort();
  if (signal) signal.addEventListener('abort', abortListener, { once: true });
  try {
    const headers = { 'content-type': 'application/json', accept: 'application/json' };
    if (token.length > 0) headers.authorization = 'Bearer ' + token;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: 'error'
    });
    if (!response.ok) {
      throw Object.assign(new Error('Voice Provider returned HTTP ' + String(response.status) + '.'), { code: 'voice_provider_http_error' });
    }
    const declaredLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
    if (declaredLength > maximumResponseBytes) {
      throw Object.assign(new Error('Voice Provider response exceeds the configured size limit.'), { code: 'voice_provider_response_too_large' });
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximumResponseBytes) {
      throw Object.assign(new Error('Voice Provider response exceeds the configured size limit.'), { code: 'voice_provider_response_too_large' });
    }
    try {
      return JSON.parse(bytes.toString('utf8'));
    } catch (_error) {
      throw Object.assign(new Error('Voice Provider returned invalid JSON.'), { code: 'voice_provider_response_invalid' });
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error('Voice Provider request timed out or was cancelled.'), { code: signal && signal.aborted ? 'voice_cancelled' : 'voice_provider_timeout' });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', abortListener);
  }
}

class VoiceManager {
  constructor(options) {
    const config = objectValue(options);
    this.now = typeof config.now === 'function' ? config.now : () => Date.now();
    this.requestJson = typeof config.requestJson === 'function' ? config.requestJson : defaultJsonRequest;
    this.onUpdated = typeof config.onUpdated === 'function' ? config.onUpdated : () => {};
    const configuredSttEndpoint = Object.prototype.hasOwnProperty.call(config, 'sttEndpoint')
      ? readString(config, 'sttEndpoint', '')
      : endpointFromEnvironment('AGENT_BRIDGE_VOICE_STT_URL');
    const configuredTtsEndpoint = Object.prototype.hasOwnProperty.call(config, 'ttsEndpoint')
      ? readString(config, 'ttsEndpoint', '')
      : endpointFromEnvironment('AGENT_BRIDGE_VOICE_TTS_URL');
    const sttEndpoint = normalizeEndpoint(configuredSttEndpoint);
    const ttsEndpoint = normalizeEndpoint(configuredTtsEndpoint);
    this.sttEndpoint = sttEndpoint.url;
    this.ttsEndpoint = ttsEndpoint.url;
    this.endpointWarnings = [];
    if (sttEndpoint.invalid) this.endpointWarnings.push('stt_endpoint_requires_https');
    if (ttsEndpoint.invalid) this.endpointWarnings.push('tts_endpoint_requires_https');
    this.sttRetentionPolicy = readRetentionPolicy(config, 'sttRetentionPolicy', 'AGENT_BRIDGE_VOICE_STT_RETENTION');
    this.ttsRetentionPolicy = readRetentionPolicy(config, 'ttsRetentionPolicy', 'AGENT_BRIDGE_VOICE_TTS_RETENTION');
    this.sttToken = readString(config, 'sttToken', tokenForEnvironment('AGENT_BRIDGE_VOICE_STT_TOKEN_ENV', 'AGENT_BRIDGE_VOICE_STT_TOKEN'));
    this.ttsToken = readString(config, 'ttsToken', tokenForEnvironment('AGENT_BRIDGE_VOICE_TTS_TOKEN_ENV', 'AGENT_BRIDGE_VOICE_TTS_TOKEN'));
    // Bridge does not own a microphone or speaker. These flags are opt-in for a
    // future platform adapter and must never be inferred from remote endpoints.
    this.audioCapture = readBoolean(config, 'audioCapture', false);
    this.audioPlayback = readBoolean(config, 'audioPlayback', false);
    this.voiceActivityEvents = readBoolean(config, 'voiceActivityEvents', false);
    this.interruptionHandling = readBoolean(config, 'interruptionHandling', false);
    this.timeoutMs = boundedInteger(config.timeoutMs, DEFAULT_TIMEOUT_MS, 1000, 120000);
    this.sessionTtlMs = boundedInteger(config.sessionTtlMs, DEFAULT_SESSION_TTL_MS, 10000, 30 * 60 * 1000);
    this.maxChunkBytes = boundedInteger(config.maxChunkBytes, DEFAULT_MAX_CHUNK_BYTES, 1024, 2 * 1024 * 1024);
    this.maxSessionBytes = boundedInteger(config.maxSessionBytes, DEFAULT_MAX_SESSION_BYTES, this.maxChunkBytes, 64 * 1024 * 1024);
    this.maxResponseBytes = boundedInteger(config.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES, 1024, 64 * 1024 * 1024);
    this.maxChunksPerSecond = boundedInteger(config.maxChunksPerSecond, DEFAULT_MAX_CHUNKS_PER_SECOND, 1, 100);
    this.maxTtsTextLength = boundedInteger(config.maxTtsTextLength, DEFAULT_MAX_TTS_TEXT_LENGTH, 1, 32000);
    this.sessions = new Map();
    this.sttRequests = new Map();
    this.ttsRequests = new Map();
  }

  isAvailable() {
    return this.sttEndpoint.length > 0 || this.ttsEndpoint.length > 0;
  }

  status() {
    this.pruneExpired();
    const remoteSpeechToText = this.sttEndpoint.length > 0;
    const remoteTextToSpeech = this.ttsEndpoint.length > 0;
    const retentionWarnings = [];
    if (remoteSpeechToText && this.sttRetentionPolicy.policy === 'unknown') {
      retentionWarnings.push('stt_retention_policy_unknown');
    }
    if (remoteTextToSpeech && this.ttsRetentionPolicy.policy === 'unknown') {
      retentionWarnings.push('tts_retention_policy_unknown');
    }
    const retentionStatus = remoteSpeechToText || remoteTextToSpeech
      ? (retentionWarnings.length === 0 ? 'declared' : 'unknown')
      : 'not_applicable';
    return {
      ok: true,
      action: 'voice.status',
      available: this.isAvailable(),
      speechRecognition: remoteSpeechToText,
      textToSpeech: remoteTextToSpeech,
      streamingUpload: true,
      capabilities: {
        audioCapture: this.audioCapture,
        audioPlayback: this.audioPlayback,
        speechToText: remoteSpeechToText,
        textToSpeech: remoteTextToSpeech,
        remoteSpeechToText,
        remoteTextToSpeech,
        voiceActivityEvents: this.voiceActivityEvents,
        interruptionHandling: this.interruptionHandling
      },
      privacy: {
        status: retentionStatus,
        userNoticeRequired: retentionWarnings.length > 0,
        speechToText: {
          dataForwarded: remoteSpeechToText,
          retention: publicRetentionPolicy(this.sttRetentionPolicy)
        },
        textToSpeech: {
          dataForwarded: remoteTextToSpeech,
          retention: publicRetentionPolicy(this.ttsRetentionPolicy)
        }
      },
      activeSessions: this.sessions.size,
      activeSttRequests: this.sttRequests.size,
      activeTtsRequests: this.ttsRequests.size,
      limits: {
        maxChunkBytes: this.maxChunkBytes,
        maxSessionBytes: this.maxSessionBytes,
        maxChunksPerSecond: this.maxChunksPerSecond,
        maxTtsTextLength: this.maxTtsTextLength,
        timeoutMs: this.timeoutMs
      },
      warnings: this.endpointWarnings.concat(retentionWarnings),
      updatedAt: nowIso(this.now())
    };
  }

  start(payload, ownerId) {
    this.pruneExpired();
    if (this.sttEndpoint.length === 0) {
      return publicFailure('voice.session.start', 'capability_unavailable', 'Speech recognition is not configured.', 'Configure AGENT_BRIDGE_VOICE_STT_URL with an HTTPS Provider endpoint.');
    }
    const source = objectValue(payload);
    const profile = normalizeAudioProfile(source, 'voice.session.start');
    if (!profile.ok) return profile;
    const language = normalizeVoiceLanguage(readString(source, 'language', ''));
    if (language === null) {
      return publicFailure('voice.session.start', 'voice_language_invalid', 'Voice language is invalid.', 'Use a short BCP-47 style language tag such as en-US.');
    }
    const nowMs = this.now();
    const session = {
      id: randomId('voice'),
      ownerId: typeof ownerId === 'string' ? ownerId : '',
      status: 'recording',
      mimeType: profile.mimeType,
      language,
      sampleRate: profile.sampleRate,
      channels: profile.channels,
      sampleBits: profile.sampleBits,
      chunks: [],
      bytes: 0,
      nextSequence: 0,
      rateWindowStartedAt: nowMs,
      rateWindowChunks: 0,
      createdAt: nowIso(nowMs),
      updatedAt: nowIso(nowMs),
      expiresAt: nowIso(nowMs + this.sessionTtlMs),
      controller: null,
      transcription: null
    };
    this.sessions.set(session.id, session);
    const result = { ok: true, action: 'voice.session.start', session: this.publicSession(session), updatedAt: session.updatedAt };
    result.mode = 'remote_stt';
    result.provider = 'bridge';
    this.emit('session.started', result, session.ownerId);
    return result;
  }

  chunk(payload, ownerId) {
    this.pruneExpired();
    const source = objectValue(payload);
    const session = this.sessions.get(readString(source, 'sessionId', ''));
    const failure = this.validateOwnedSession(session, ownerId, 'voice.session.chunk');
    if (failure) return failure;
    if (session.status !== 'recording') {
      return publicFailure('voice.session.chunk', 'voice_session_not_recording', 'Voice session is not accepting audio.', 'Start a new voice session.');
    }
    const sequence = boundedInteger(readNumber(source, 'sequence', session.nextSequence), session.nextSequence, 0, 0x7fffffff);
    if (sequence !== session.nextSequence) {
      return publicFailure('voice.session.chunk', 'voice_sequence_mismatch', 'Audio chunk sequence is out of order.', 'Retry using sequence ' + String(session.nextSequence) + '.');
    }
    const nowMs = this.now();
    if (nowMs - session.rateWindowStartedAt >= 1000) {
      session.rateWindowStartedAt = nowMs;
      session.rateWindowChunks = 0;
    }
    if (session.rateWindowChunks >= this.maxChunksPerSecond) {
      return publicFailure('voice.session.chunk', 'rate_limited', 'Voice audio chunk rate exceeded the configured limit.', 'Reduce the audio chunk frequency and retry.');
    }
    const buffer = decodeAudioBase64(readString(source, 'audioBase64', ''), this.maxChunkBytes);
    if (!buffer) {
      return publicFailure('voice.session.chunk', 'voice_chunk_invalid', 'Audio chunk is invalid or too large.', 'Send canonical base64 audio within the advertised chunk limit.');
    }
    if (session.bytes + buffer.length > this.maxSessionBytes) {
      buffer.fill(0);
      return publicFailure('voice.session.chunk', 'voice_session_too_large', 'Voice session exceeds the configured audio limit.', 'Finalize or cancel this session and record a shorter message.');
    }
    session.chunks.push(buffer);
    session.bytes += buffer.length;
    session.nextSequence += 1;
    session.rateWindowChunks += 1;
    session.updatedAt = nowIso(nowMs);
    const requestedVadState = readString(source, 'vadState', 'unknown');
    const vadState = requestedVadState === 'speech' || requestedVadState === 'silence' || requestedVadState === 'unknown'
      ? requestedVadState : 'unknown';
    const result = {
      ok: true,
      action: 'voice.session.chunk',
      sessionId: session.id,
      acceptedSequence: sequence,
      nextSequence: session.nextSequence,
      receivedBytes: session.bytes,
      vadState,
      updatedAt: session.updatedAt
    };
    this.emit('session.chunk.accepted', result, session.ownerId);
    if (vadState !== 'unknown') this.emit('vad.changed', { ok: true, action: 'voice.vad.changed', sessionId: session.id, vadState, updatedAt: session.updatedAt }, session.ownerId);
    return result;
  }

  async finish(payload, ownerId) {
    this.pruneExpired();
    const source = objectValue(payload);
    const session = this.sessions.get(readString(source, 'sessionId', ''));
    const failure = this.validateOwnedSession(session, ownerId, 'voice.session.finish');
    if (failure) return failure;
    if (session.status !== 'recording' || session.bytes === 0) {
      return publicFailure('voice.session.finish', 'voice_session_empty', 'Voice session has no audio to transcribe.', 'Record audio before finishing the session.');
    }
    const requestedLanguage = normalizeVoiceLanguage(readString(source, 'language', session.language));
    if (requestedLanguage === null) {
      return publicFailure('voice.session.finish', 'voice_language_invalid', 'Voice language is invalid.', 'Use a short BCP-47 style language tag such as en-US.');
    }
    session.status = 'transcribing';
    session.updatedAt = nowIso(this.now());
    session.controller = new AbortController();
    const requestRecord = {
      requestId: randomId('stt'),
      sessionId: session.id,
      ownerId: session.ownerId,
      controller: session.controller,
      cancelled: false,
      cancelReason: ''
    };
    session.transcription = requestRecord;
    this.sttRequests.set(requestRecord.requestId, requestRecord);
    this.emit('session.transcribing', {
      ok: true,
      action: 'voice.session.finish',
      session: this.publicSession(session),
      requestId: requestRecord.requestId,
      updatedAt: session.updatedAt
    }, session.ownerId);
    const audio = Buffer.concat(session.chunks, session.bytes);
    try {
      const response = objectValue(await this.requestJson(this.sttEndpoint, this.sttToken, {
        audioBase64: audio.toString('base64'),
        mimeType: session.mimeType,
        language: requestedLanguage,
        sampleRate: session.sampleRate,
        channels: session.channels,
        sampleBits: session.sampleBits,
        sessionId: session.id,
        requestId: requestRecord.requestId
      }, this.timeoutMs, this.maxResponseBytes, requestRecord.controller.signal));
      this.assertActiveSttRequest(session, requestRecord);
      const transcript = normalizeSafeText(readString(response, 'transcript', readString(response, 'text', '')), MAX_TRANSCRIPT_LENGTH, true);
      const partialTranscript = normalizeSafeText(readString(response, 'partialTranscript', readString(response, 'partial', '')), MAX_PARTIAL_TRANSCRIPT_LENGTH, true);
      if (transcript === null || partialTranscript === null) {
        throw Object.assign(new Error('Voice Provider transcript exceeded the size limit.'), { code: 'voice_transcript_too_large' });
      }
      if (partialTranscript.length > 0 && partialTranscript !== transcript) {
        this.emit('transcript.partial', {
          ok: true,
          action: 'voice.transcript.partial',
          sessionId: session.id,
          transcript: partialTranscript,
          final: false,
          isFinal: false,
          updatedAt: nowIso(this.now())
        }, session.ownerId);
      }
      if (transcript.length === 0) {
        throw Object.assign(new Error('Speech recognition Provider returned no transcript.'), { code: 'voice_transcript_empty' });
      }
      const result = {
        ok: true,
        action: 'voice.session.finish',
        sessionId: session.id,
        mode: 'remote_stt',
        provider: 'bridge',
        transcript,
        final: true,
        language: normalizeVoiceLanguage(readString(response, 'language', requestedLanguage)) || requestedLanguage,
        updatedAt: nowIso(this.now())
      };
      const confidence = readOptionalNumber(response, 'confidence');
      if (confidence !== undefined && confidence >= 0 && confidence <= 1) result.confidence = confidence;
      const durationMs = readOptionalNumber(response, 'durationMs');
      if (durationMs !== undefined && durationMs >= 0 && durationMs <= 24 * 60 * 60 * 1000) result.durationMs = durationMs;
      this.assertActiveSttRequest(session, requestRecord);
      this.emit('transcript.final', result, session.ownerId);
      return result;
    } catch (error) {
      const cancelled = this.isCancelledSttRequest(session, requestRecord);
      const failureError = cancelled
        ? Object.assign(new Error('Voice Provider request was cancelled.'), { code: 'voice_cancelled' })
        : error;
      const result = Object.assign({ requestId: requestRecord.requestId, state: cancelled ? 'cancelled' : 'failed' }, providerFailure('voice.session.finish', failureError, 'Check the configured speech recognition Provider and retry.'));
      if (!cancelled) {
        this.emit('session.failed', Object.assign({ sessionId: session.id }, result), session.ownerId);
      }
      return result;
    } finally {
      audio.fill(0);
      this.sttRequests.delete(requestRecord.requestId);
      if (session.transcription === requestRecord) session.transcription = null;
      this.destroySession(session.id);
    }
  }

  cancel(payload, ownerId) {
    const source = objectValue(payload);
    const sessionId = readString(source, 'sessionId', '');
    const session = this.sessions.get(sessionId);
    const failure = this.validateOwnedSession(session, ownerId, 'voice.session.cancel');
    if (failure) return failure;
    if (session.transcription) {
      this.cancelSttRequest(session.transcription, 'user_cancelled');
    } else if (session.controller) {
      session.controller.abort();
    }
    this.destroySession(sessionId);
    const result = { ok: true, action: 'voice.session.cancel', sessionId, cancelled: true, updatedAt: nowIso(this.now()) };
    this.emit('session.cancelled', result, session.ownerId);
    return result;
  }

  async speak(payload, ownerId) {
    if (this.ttsEndpoint.length === 0) {
      return publicFailure('voice.tts.speak', 'capability_unavailable', 'Text to speech is not configured.', 'Configure AGENT_BRIDGE_VOICE_TTS_URL with an HTTPS Provider endpoint.');
    }
    const source = objectValue(payload);
    const clientRequestId = normalizeVoiceClientRequestId(readString(source, 'clientRequestId', ''));
    if (clientRequestId === null) {
      return publicFailure('voice.tts.speak', 'voice_client_request_id_invalid', 'Voice client request identifier is invalid.', 'Use a short identifier containing letters, numbers, dots, underscores, colons, or hyphens.');
    }
    const input = normalizeSafeText(readString(source, 'text', ''), this.maxTtsTextLength, true);
    if (input === null || input.length === 0) {
      return publicFailure('voice.tts.speak', 'voice_tts_text_invalid', 'Text to speech input is empty or too long.', 'Use non-empty text within the advertised text limit.');
    }
    const language = normalizeVoiceLanguage(readString(source, 'language', ''));
    if (language === null) {
      return publicFailure('voice.tts.speak', 'voice_language_invalid', 'Voice language is invalid.', 'Use a short BCP-47 style language tag such as en-US.');
    }
    const voiceId = normalizeVoiceId(readString(source, 'voiceId', ''));
    if (voiceId === null) {
      return publicFailure('voice.tts.speak', 'voice_id_invalid', 'Voice identifier is invalid.', 'Use a voice identifier within the advertised length limit.');
    }
    const requestedFormat = normalizeAudioMimeType(readString(source, 'format', DEFAULT_TTS_FORMAT), '');
    if (!requestedFormat) {
      return publicFailure('voice.tts.speak', 'voice_tts_format_invalid', 'Text to speech format is not supported.', 'Use an advertised audio format and retry.');
    }
    const requestId = randomId('tts');
    const controller = new AbortController();
    const requestRecord = {
      ownerId: typeof ownerId === 'string' ? ownerId : '',
      clientRequestId,
      controller,
      cancelled: false,
      cancelNotified: false
    };
    this.ttsRequests.set(requestId, requestRecord);
    this.emit('tts.started', { ok: true, action: 'voice.tts.speak', requestId, clientRequestId, state: 'synthesizing', updatedAt: nowIso(this.now()) }, requestRecord.ownerId);
    try {
      const response = objectValue(await this.requestJson(this.ttsEndpoint, this.ttsToken, {
        text: input,
        language,
        voiceId,
        format: requestedFormat,
        requestId
      }, this.timeoutMs, this.maxResponseBytes, controller.signal));
      this.assertActiveTtsRequest(requestId, requestRecord);
      const audioBase64 = readString(response, 'audioBase64', '');
      const audio = decodeAudioBase64(audioBase64, this.maxResponseBytes);
      if (!audio) {
        throw Object.assign(new Error('Text to speech Provider returned invalid audio.'), { code: 'voice_tts_audio_invalid' });
      }
      const audioBytes = audio.length;
      audio.fill(0);
      const responseFormat = readString(response, 'mimeType', readString(response, 'format', requestedFormat));
      const mimeType = normalizeAudioMimeType(responseFormat, '');
      if (!mimeType) {
        throw Object.assign(new Error('Text to speech Provider returned an unsupported audio format.'), { code: 'voice_tts_format_unsupported' });
      }
      const responseProfile = normalizeAudioProfile({
        mimeType,
        sampleRate: readOptionalNumber(response, 'sampleRate') === undefined ? readOptionalNumber(source, 'sampleRate') : readOptionalNumber(response, 'sampleRate'),
        channels: readOptionalNumber(response, 'channels') === undefined ? readOptionalNumber(source, 'channels') : readOptionalNumber(response, 'channels'),
        sampleBits: readOptionalNumber(response, 'sampleBits') === undefined ? readOptionalNumber(source, 'sampleBits') : readOptionalNumber(response, 'sampleBits')
      }, 'voice.tts.speak');
      if (!responseProfile.ok) {
        throw Object.assign(new Error('Text to speech Provider returned an invalid audio profile.'), { code: 'voice_tts_audio_profile_invalid' });
      }
      const responseDurationMs = readOptionalNumber(response, 'durationMs');
      if (responseDurationMs !== undefined && (responseDurationMs < 0 || responseDurationMs > 24 * 60 * 60 * 1000)) {
        throw Object.assign(new Error('Text to speech Provider returned an invalid duration.'), { code: 'voice_tts_audio_profile_invalid' });
      }
      const result = {
        ok: true,
        action: 'voice.tts.speak',
        requestId,
        clientRequestId,
        mode: 'remote_tts',
        provider: 'bridge',
        state: 'ready',
        audioBase64,
        audioBytes,
        mimeType,
        format: mimeType,
        sampleRate: responseProfile.sampleRate,
        channels: responseProfile.channels,
        sampleBits: responseProfile.sampleBits,
        updatedAt: nowIso(this.now())
      };
      if (responseDurationMs !== undefined) result.durationMs = responseDurationMs;
      this.assertActiveTtsRequest(requestId, requestRecord);
      this.emit('tts.ready', result, requestRecord.ownerId);
      return result;
    } catch (error) {
      const cancelled = requestRecord.cancelled || controller.signal.aborted || this.ttsRequests.get(requestId) !== requestRecord;
      const category = cancelled
        ? 'voice_cancelled'
        : (error && typeof error.code === 'string' && PROVIDER_FAILURE_CATEGORIES.has(error.code) ? error.code : 'voice_provider_failed');
      const failureError = cancelled
        ? Object.assign(new Error('Voice Provider request was cancelled.'), { code: 'voice_cancelled' })
        : error;
      const result = Object.assign({ requestId, clientRequestId, state: category === 'voice_cancelled' ? 'cancelled' : 'failed' }, providerFailure('voice.tts.speak', failureError, 'Check the configured text to speech Provider and retry.'));
      if (!cancelled || !requestRecord.cancelNotified) this.emit('tts.failed', result, requestRecord.ownerId);
      return result;
    } finally {
      this.ttsRequests.delete(requestId);
    }
  }

  stop(payload, ownerId) {
    const source = objectValue(payload);
    const requestedRequestId = readString(source, 'requestId', '');
    const requestedClientRequestId = normalizeVoiceClientRequestId(readString(source, 'clientRequestId', ''));
    if (requestedClientRequestId === null) {
      return publicFailure('voice.tts.stop', 'voice_client_request_id_invalid', 'Voice client request identifier is invalid.', 'Use the client request identifier returned when speech started.');
    }
    let requestId = '';
    let request = null;
    if (requestedClientRequestId.length > 0) {
      for (const [candidateId, candidate] of this.ttsRequests.entries()) {
        if (candidate.clientRequestId === requestedClientRequestId &&
          (candidate.ownerId.length === 0 || candidate.ownerId === ownerId)) {
          requestId = candidateId;
          request = candidate;
          break;
        }
      }
    } else {
      requestId = requestedRequestId;
      request = this.ttsRequests.get(requestId);
    }
    if (!request || (request.ownerId.length > 0 && request.ownerId !== ownerId)) {
      return publicFailure('voice.tts.stop', 'voice_tts_not_found', 'Text to speech request was not found.', 'Refresh Voice status and retry with an active request.');
    }
    request.cancelled = true;
    request.cancelNotified = true;
    request.controller.abort();
    const result = { ok: true, action: 'voice.tts.stop', requestId, clientRequestId: request.clientRequestId, cancelled: true, state: 'cancelled', updatedAt: nowIso(this.now()) };
    this.emit('tts.cancelled', result, request.ownerId);
    return result;
  }

  detachOwner(ownerId) {
    if (typeof ownerId !== 'string' || ownerId.length === 0) return;
    for (const session of Array.from(this.sessions.values())) {
      if (session.ownerId === ownerId) {
        if (session.transcription) {
          this.cancelSttRequest(session.transcription, 'owner_detached');
        } else if (session.controller) {
          session.controller.abort();
        }
        this.destroySession(session.id);
      }
    }
    for (const request of this.ttsRequests.values()) {
      if (request.ownerId === ownerId) {
        request.cancelled = true;
        request.cancelNotified = true;
        request.controller.abort();
      }
    }
  }

  shutdown() {
    for (const session of Array.from(this.sessions.values())) {
      if (session.transcription) {
        this.cancelSttRequest(session.transcription, 'shutdown');
      } else if (session.controller) {
        session.controller.abort();
      }
      this.destroySession(session.id);
    }
    this.sttRequests.clear();
    for (const request of this.ttsRequests.values()) {
      request.cancelled = true;
      request.cancelNotified = true;
      request.controller.abort();
    }
    this.ttsRequests.clear();
  }

  assertActiveTtsRequest(requestId, requestRecord) {
    if (requestRecord.cancelled || requestRecord.controller.signal.aborted || this.ttsRequests.get(requestId) !== requestRecord) {
      throw Object.assign(new Error('Voice Provider request was cancelled.'), { code: 'voice_cancelled' });
    }
  }

  isCancelledSttRequest(session, requestRecord) {
    return requestRecord.cancelled || requestRecord.controller.signal.aborted ||
      this.sttRequests.get(requestRecord.requestId) !== requestRecord ||
      this.sessions.get(session.id) !== session || session.transcription !== requestRecord;
  }

  assertActiveSttRequest(session, requestRecord) {
    if (this.isCancelledSttRequest(session, requestRecord)) {
      throw Object.assign(new Error('Voice Provider request was cancelled.'), { code: 'voice_cancelled' });
    }
  }

  cancelSttRequest(requestRecord, reason) {
    if (!requestRecord) return;
    requestRecord.cancelled = true;
    requestRecord.cancelReason = typeof reason === 'string' ? reason : '';
    requestRecord.controller.abort();
  }

  validateOwnedSession(session, ownerId, action) {
    if (!session || (session.ownerId.length > 0 && session.ownerId !== ownerId)) {
      return publicFailure(action, 'voice_session_not_found', 'Voice session was not found.', 'Start a new voice session.');
    }
    return null;
  }

  publicSession(session) {
    return {
      id: session.id,
      status: session.status,
      mimeType: session.mimeType,
      language: session.language,
      sampleRate: session.sampleRate,
      channels: session.channels,
      sampleBits: session.sampleBits,
      receivedBytes: session.bytes,
      nextSequence: session.nextSequence,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt
    };
  }

  pruneExpired() {
    const nowMs = this.now();
    for (const session of Array.from(this.sessions.values())) {
      if (Date.parse(session.expiresAt) <= nowMs) {
        if (session.transcription) {
          this.cancelSttRequest(session.transcription, 'expired');
        } else if (session.controller) {
          session.controller.abort();
        }
        const ownerId = session.ownerId;
        this.destroySession(session.id);
        this.emit('session.expired', { ok: false, action: 'voice.session.expired', sessionId: session.id, failureCategory: 'voice_session_expired', message: 'Voice session expired.', remediation: 'Start a new voice session.', updatedAt: nowIso(nowMs) }, ownerId);
      }
    }
  }

  destroySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    for (const chunk of session.chunks) chunk.fill(0);
    session.chunks.length = 0;
    session.bytes = 0;
    session.controller = null;
    session.transcription = null;
    this.sessions.delete(sessionId);
  }

  emit(kind, payload, ownerId) {
    const event = Object.assign({ kind }, payload);
    if (typeof ownerId === 'string' && ownerId.length > 0) event.ownerId = ownerId;
    try {
      this.onUpdated(event);
    } catch (_error) {
      // Voice state must remain usable if an observer fails.
    }
  }
}

module.exports = {
  VoiceManager,
  decodeAudioBase64,
  defaultJsonRequest,
  normalizeAudioMimeType,
  normalizeAudioProfile,
  normalizeVoiceLanguage,
  normalizeRetentionPolicy,
  normalizeRetentionSource,
  normalizeRetentionDuration,
  readRetentionPolicy,
  publicRetentionPolicy
};
