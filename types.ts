
export enum VoiceName {
  ZEPHYR = 'Zephyr',
  PUCK = 'Puck',
  KORE = 'Kore',
  FENRIR = 'Fenrir',
  CHARON = 'Charon'
}

export interface TranscriptionEntry {
  id: string;
  type: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface VoicePersona {
  id: VoiceName;
  label: string;
  description: string;
  color: string;
}

export const PERSONAS: VoicePersona[] = [
  { id: VoiceName.ZEPHYR, label: 'Zephyr', description: 'Breezy & Energetic', color: 'from-blue-400 to-cyan-400' },
  { id: VoiceName.PUCK, label: 'Puck', description: 'Mischievous & Quick', color: 'from-purple-400 to-pink-400' },
  { id: VoiceName.KORE, label: 'Kore', description: 'Warm & Natural', color: 'from-orange-400 to-yellow-400' },
  { id: VoiceName.FENRIR, label: 'Fenrir', description: 'Deep & Authoritative', color: 'from-red-400 to-orange-400' },
  { id: VoiceName.CHARON, label: 'Charon', description: 'Calm & Wise', color: 'from-indigo-400 to-purple-400' },
];
