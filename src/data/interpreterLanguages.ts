export interface InterpreterLanguage {
  code: string;
  name: string;
  nativeName: string;
  region: string;
  speechLocale: string;
  gtxCode?: string;
}

export const INTERPRETER_LANGUAGES: InterpreterLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English', region: 'Global', speechLocale: 'en-US' },
  { code: 'zh-CN', name: 'Chinese (Mandarin)', nativeName: '中文 (普通话)', region: 'East Asia', speechLocale: 'zh-CN' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', region: 'India', speechLocale: 'hi-IN' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', region: 'India', speechLocale: 'mr-IN' },
  { code: 'tcy', name: 'Tulu', nativeName: 'ತುಳು', region: 'India', speechLocale: 'kn-IN' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', region: 'India', speechLocale: 'te-IN' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', region: 'India', speechLocale: 'ta-IN' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', region: 'India', speechLocale: 'kn-IN' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', region: 'India', speechLocale: 'ml-IN' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', region: 'India', speechLocale: 'gu-IN' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', region: 'India', speechLocale: 'pa-IN' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', region: 'South Asia', speechLocale: 'bn-IN' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', region: 'South Asia', speechLocale: 'ur-PK' },
  { code: 'kok', name: 'Konkani', nativeName: 'कोंकणी', region: 'India', speechLocale: 'mr-IN', gtxCode: 'gom' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', region: 'India', speechLocale: 'or-IN' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', region: 'India', speechLocale: 'as-IN' },
  { code: 'sa', name: 'Sanskrit', nativeName: 'संस्कृतम्', region: 'India', speechLocale: 'hi-IN' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', region: 'South Asia', speechLocale: 'ne-NP' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල', region: 'South Asia', speechLocale: 'si-LK' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', region: 'Europe / Americas', speechLocale: 'es-ES' },
  { code: 'fr', name: 'French', nativeName: 'Français', region: 'Europe / Global', speechLocale: 'fr-FR' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', region: 'Europe', speechLocale: 'de-DE' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', region: 'Europe', speechLocale: 'it-IT' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', region: 'Europe / Americas', speechLocale: 'pt-BR' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', region: 'Eurasia', speechLocale: 'ru-RU' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', region: 'East Asia', speechLocale: 'ja-JP' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', region: 'East Asia', speechLocale: 'ko-KR' },
  { code: 'yue', name: 'Chinese (Cantonese)', nativeName: '粵語', region: 'East Asia', speechLocale: 'zh-HK', gtxCode: 'yue' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', region: 'Middle East', speechLocale: 'ar-SA' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', region: 'Middle East / Europe', speechLocale: 'tr-TR' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', region: 'Europe', speechLocale: 'nl-NL' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', region: 'Europe', speechLocale: 'pl-PL' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', region: 'Europe', speechLocale: 'sv-SE' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', region: 'Europe', speechLocale: 'nb-NO' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', region: 'Europe', speechLocale: 'da-DK' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', region: 'Europe', speechLocale: 'fi-FI' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', region: 'Europe', speechLocale: 'el-GR' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', region: 'Middle East', speechLocale: 'he-IL', gtxCode: 'iw' },
  { code: 'fa', name: 'Persian (Farsi)', nativeName: 'فارسی', region: 'Middle East', speechLocale: 'fa-IR' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', region: 'Southeast Asia', speechLocale: 'th-TH' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', region: 'Southeast Asia', speechLocale: 'vi-VN' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', region: 'Southeast Asia', speechLocale: 'id-ID' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', region: 'Southeast Asia', speechLocale: 'ms-MY' },
  { code: 'tl', name: 'Filipino (Tagalog)', nativeName: 'Filipino', region: 'Southeast Asia', speechLocale: 'fil-PH' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', region: 'Africa', speechLocale: 'sw-KE' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', region: 'Europe', speechLocale: 'uk-UA' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', region: 'Europe', speechLocale: 'cs-CZ' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', region: 'Europe', speechLocale: 'ro-RO' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', region: 'Europe', speechLocale: 'hu-HU' },
  { code: 'my', name: 'Burmese', nativeName: 'မြန်မာ', region: 'Southeast Asia', speechLocale: 'my-MM' },
];

export function findLanguageByCode(code: string): InterpreterLanguage | undefined {
  return INTERPRETER_LANGUAGES.find(
    (l) => l.code.toLowerCase() === code.toLowerCase() || l.gtxCode?.toLowerCase() === code.toLowerCase()
  );
}
