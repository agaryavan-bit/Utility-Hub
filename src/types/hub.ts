export type ActiveModule = 'hub' | 'interpreter' | 'tempmail' | 'qr' | 'weather' | 'notes' | 'reminders' | 'anki';

export type ToolyCategoryId =
  | 'general'
  | 'text'
  | 'generator'
  | 'calculation'
  | 'image'
  | 'unit'
  | 'finance'
  | 'randomizer'
  | 'health'
  | 'development'
  | 'colors';

export interface ToolySubTool {
  id: string;
  categoryId: ToolyCategoryId;
  name: string;
  shortName: string;
  description: string;
  keywords: string[];
}

export interface ToolyCategory {
  id: ToolyCategoryId;
  name: string;
  subtitle: string;
  accentHex: string;
  softBg: string;
  isNew?: boolean;
  subTools: ToolySubTool[];
}

export interface NoteChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export type NoteTint = 'pearl' | 'sky' | 'mint' | 'amber' | 'lavender' | 'rose';

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  checklist: NoteChecklistItem[];
  folder: string;
  tint: NoteTint;
  pinned: boolean;
  updatedAt: number;
  createdAt: number;
}

export type ReminderPriority = 'none' | 'low' | 'medium' | 'high';
export type ReminderRepeat = 'none' | 'daily' | 'weekly' | 'monthly';

export interface ReminderList {
  id: string;
  name: string;
  color: string;
}

export interface ReminderItem {
  id: string;
  title: string;
  notes: string;
  listId: string;
  dueDate: string; // YYYY-MM-DD or ''
  dueTime: string; // HH:mm or ''
  priority: ReminderPriority;
  repeat: ReminderRepeat;
  flagged: boolean;
  completed: boolean;
  completedAt?: number;
  createdAt: number;
}

export type AnkiCardType = 'basic' | 'cloze';
export type AnkiCardStatus = 'new' | 'learning' | 'review';

export interface AnkiDeck {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: number;
}

export interface AnkiCard {
  id: string;
  deckId: string;
  type: AnkiCardType;
  front: string;
  back: string;
  hint: string;
  tags: string[];
  easeFactor: number;
  interval: number; // days (can be fractional for minutes in learning)
  repetitions: number;
  dueDate: number; // epoch ms
  status: AnkiCardStatus;
  createdAt: number;
}

export interface AnkiStats {
  reviewedToday: number;
  lastReviewDate: string; // YYYY-MM-DD
  streakDays: number;
  totalReviews: number;
}

export type QrPayloadType = 'url' | 'text' | 'wifi' | 'vcard' | 'email' | 'phone' | 'sms';

export interface QrHistoryItem {
  id: string;
  mode: 'generated' | 'scanned';
  type: QrPayloadType;
  payload: string;
  label: string;
  timestamp: number;
}

export interface InterpreterHistoryItem {
  id: string;
  sourceLangCode: string;
  sourceLangName: string;
  targetLangCode: string;
  targetLangName: string;
  sourceText: string;
  translatedText: string;
  transliteration: string;
  inputMode: 'voice' | 'text';
  timestamp: number;
}

export interface WeatherCity {
  id: string;
  name: string;
  admin1?: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface WeatherForecastCache {
  cityId: string;
  fetchedAt: number;
  current: {
    temperature: number;
    apparentTemperature: number;
    humidity: number;
    windSpeed: number;
    windDirection: number;
    pressure: number;
    weatherCode: number;
    isDay: boolean;
    uvIndex: number;
    visibility: number;
    cloudCover: number;
  };
  hourly: {
    time: string;
    temperature: number;
    weatherCode: number;
    precipitationProb: number;
    isDay: boolean;
  }[];
  daily: {
    date: string;
    weatherCode: number;
    tempMax: number;
    tempMin: number;
    precipitationProb: number;
    sunrise: string;
    sunset: string;
    uvMax: number;
  }[];
  aqi?: {
    usAqi: number;
    pm25: number;
    pm10: number;
  };
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface QuickReminderDraft {
  title: string;
  notes: string;
  dueDate?: string;
  dueTime?: string;
  listId?: string;
}

export interface NoteToAnkiDraft {
  sourceTitle: string;
  cards: { front: string; back: string }[];
}

export interface HubPreferences {
  hapticsEnabled: boolean;
  soundHapticsEnabled: boolean;
  tempUnit: 'C' | 'F';
}

export interface PersistedHubState {
  version: number;
  pinnedToolIds: string[];
  favoriteCategories: ToolyCategoryId[];
  notes: NoteItem[];
  noteFolders: string[];
  reminders: ReminderItem[];
  reminderLists: ReminderList[];
  ankiDecks: AnkiDeck[];
  ankiCards: AnkiCard[];
  ankiStats: AnkiStats;
  qrHistory: QrHistoryItem[];
  interpreterHistory: InterpreterHistoryItem[];
  weatherCities: WeatherCity[];
  activeWeatherCityId: string;
  weatherCache: Record<string, WeatherForecastCache>;
  preferences: HubPreferences;
}
