export class NGFVoicePlatformState {
  static readonly IDLE: string = 'idle';
  static readonly REQUESTING_PERMISSION: string = 'requesting_permission';
  static readonly PREPARING: string = 'preparing';
  static readonly RECORDING: string = 'recording';
  static readonly FINISHING: string = 'finishing';
  static readonly SPEAKING: string = 'speaking';
  static readonly INTERRUPTED: string = 'interrupted';
  static readonly ERROR: string = 'error';
}

export class NGFVoiceFailureCategory {
  static readonly NONE: string = '';
  static readonly PERMISSION_DENIED: string = 'permission_denied';
  static readonly APP_BACKGROUND: string = 'app_background';
  static readonly CAPABILITY_UNAVAILABLE: string = 'capability_unavailable';
  static readonly AUDIO_SESSION_FAILED: string = 'audio_session_failed';
  static readonly CAPTURE_FAILED: string = 'capture_failed';
  static readonly RECOGNITION_FAILED: string = 'recognition_failed';
  static readonly TTS_FAILED: string = 'tts_failed';
  static readonly INTERRUPTED: string = 'interrupted';
}

export class NGFVoicePermissionState {
  static readonly UNKNOWN: string = 'unknown';
  static readonly GRANTED: string = 'granted';
  static readonly DENIED: string = 'denied';
}

export class NGFVoicePermissionRemediation {
  static readonly NONE: string = '';
  static readonly OPEN_APP_PERMISSION_SETTINGS: string = 'open_app_permission_settings';
}

export class NGFVoiceAudioSessionState {
  static readonly INACTIVE: string = 'inactive';
  static readonly ACTIVE: string = 'active';
  static readonly INTERRUPTED: string = 'interrupted';
}

export class NGFVoiceCapabilitySnapshot {
  audioCapture: boolean = true;
  audioPlayback: boolean = true;
  speechRecognition: boolean = false;
  textToSpeech: boolean = false;
  engineVad: boolean = false;
  remoteSpeechToText: boolean = false;
  remoteTextToSpeech: boolean = false;
  interruptionHandling: boolean = true;
  microphonePermission: string = NGFVoicePermissionState.UNKNOWN;
  permissionRemediation: string = '';
  failureCategory: string = '';
  message: string = '';
}

export class NGFVoicePlatformSnapshot {
  state: string = NGFVoicePlatformState.IDLE;
  sessionId: string = '';
  partialTranscript: string = '';
  finalTranscript: string = '';
  vadActive: boolean = false;
  ttsRequestId: string = '';
  audioSessionState: string = NGFVoiceAudioSessionState.INACTIVE;
  failureCategory: string = '';
  message: string = '';
  updatedAt: number = 0;
  capabilities: NGFVoiceCapabilitySnapshot = new NGFVoiceCapabilitySnapshot();
}

export interface NGFVoicePlatformListener {
  onSnapshotChanged(snapshot: NGFVoicePlatformSnapshot): void;
  onAudioChunk(sessionId: string, sequence: number, chunk: Uint8Array): void;
  onTranscript(sessionId: string, text: string, isFinal: boolean, isLast: boolean): void;
}

export interface IVoicePlatform {
  setListener(listener: NGFVoicePlatformListener | null): void;
  getSnapshot(): NGFVoicePlatformSnapshot;
  initializeSpeech(language: string): Promise<NGFVoiceCapabilitySnapshot>;
  startRecording(sessionId: string, language: string, mode?: string): Promise<boolean>;
  finishRecording(): Promise<void>;
  cancelRecording(reason: string): Promise<void>;
  speak(text: string, language: string): Promise<boolean>;
  playAudioBase64(audioBase64: string, mimeType: string, sampleRate: number, channels: number,
    sampleBits?: number): Promise<boolean>;
  stopSpeaking(reason: string): Promise<void>;
  handleForeground(): void;
  handleBackground(): Promise<void>;
  release(): Promise<void>;
}
