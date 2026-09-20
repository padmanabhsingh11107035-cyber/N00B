// Every language a person can choose for the app. English is the default and the source language of all texts.
// `name` is the English name (used for searching and sent to the translator); `native` is how the language writes its own name
// (what a person looks for in the list); `rtl` languages are written right to left.

export interface LanguageInfo {
  code: string;
  name: string;
  native: string;
  rtl?: boolean;
}

export const DEFAULT_LANGUAGE = 'en';

export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'af', name: 'Afrikaans', native: 'Afrikaans' },
  { code: 'sq', name: 'Albanian', native: 'Shqip' },
  { code: 'am', name: 'Amharic', native: 'አማርኛ' },
  { code: 'ar', name: 'Arabic', native: 'العربية', rtl: true },
  { code: 'hy', name: 'Armenian', native: 'Հայերեն' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া' },
  { code: 'az', name: 'Azerbaijani', native: 'Azərbaycanca' },
  { code: 'eu', name: 'Basque', native: 'Euskara' },
  { code: 'be', name: 'Belarusian', native: 'Беларуская' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'bs', name: 'Bosnian', native: 'Bosanski' },
  { code: 'bg', name: 'Bulgarian', native: 'Български' },
  { code: 'my', name: 'Burmese', native: 'မြန်မာဘာသာ' },
  { code: 'ca', name: 'Catalan', native: 'Català' },
  { code: 'ceb', name: 'Cebuano', native: 'Cebuano' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', native: '简体中文' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', native: '繁體中文' },
  { code: 'co', name: 'Corsican', native: 'Corsu' },
  { code: 'hr', name: 'Croatian', native: 'Hrvatski' },
  { code: 'cs', name: 'Czech', native: 'Čeština' },
  { code: 'da', name: 'Danish', native: 'Dansk' },
  { code: 'dv', name: 'Dhivehi', native: 'ދިވެހި', rtl: true },
  { code: 'doi', name: 'Dogri', native: 'डोगरी' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands' },
  { code: 'eo', name: 'Esperanto', native: 'Esperanto' },
  { code: 'et', name: 'Estonian', native: 'Eesti' },
  { code: 'fil', name: 'Filipino', native: 'Filipino' },
  { code: 'fi', name: 'Finnish', native: 'Suomi' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'fy', name: 'Frisian', native: 'Frysk' },
  { code: 'gl', name: 'Galician', native: 'Galego' },
  { code: 'ka', name: 'Georgian', native: 'ქართული' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'el', name: 'Greek', native: 'Ελληνικά' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'ht', name: 'Haitian Creole', native: 'Kreyòl ayisyen' },
  { code: 'ha', name: 'Hausa', native: 'Hausa' },
  { code: 'haw', name: 'Hawaiian', native: 'ʻŌlelo Hawaiʻi' },
  { code: 'he', name: 'Hebrew', native: 'עברית', rtl: true },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'hmn', name: 'Hmong', native: 'Hmoob' },
  { code: 'hu', name: 'Hungarian', native: 'Magyar' },
  { code: 'is', name: 'Icelandic', native: 'Íslenska' },
  { code: 'ig', name: 'Igbo', native: 'Igbo' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'ga', name: 'Irish', native: 'Gaeilge' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'jv', name: 'Javanese', native: 'Basa Jawa' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ks', name: 'Kashmiri', native: 'کٲشُر', rtl: true },
  { code: 'kk', name: 'Kazakh', native: 'Қазақша' },
  { code: 'km', name: 'Khmer', native: 'ខ្មែរ' },
  { code: 'rw', name: 'Kinyarwanda', native: 'Ikinyarwanda' },
  { code: 'kok', name: 'Konkani', native: 'कोंकणी' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'ku', name: 'Kurdish (Kurmanji)', native: 'Kurdî' },
  { code: 'ckb', name: 'Kurdish (Sorani)', native: 'کوردیی ناوەندی', rtl: true },
  { code: 'ky', name: 'Kyrgyz', native: 'Кыргызча' },
  { code: 'lo', name: 'Lao', native: 'ລາວ' },
  { code: 'la', name: 'Latin', native: 'Latina' },
  { code: 'lv', name: 'Latvian', native: 'Latviešu' },
  { code: 'lt', name: 'Lithuanian', native: 'Lietuvių' },
  { code: 'lb', name: 'Luxembourgish', native: 'Lëtzebuergesch' },
  { code: 'mk', name: 'Macedonian', native: 'Македонски' },
  { code: 'mai', name: 'Maithili', native: 'मैथिली' },
  { code: 'mg', name: 'Malagasy', native: 'Malagasy' },
  { code: 'ms', name: 'Malay', native: 'Bahasa Melayu' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'mt', name: 'Maltese', native: 'Malti' },
  { code: 'mi', name: 'Maori', native: 'Te Reo Māori' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'mni', name: 'Meiteilon (Manipuri)', native: 'ꯃꯩꯇꯩꯂꯣꯟ' },
  { code: 'mn', name: 'Mongolian', native: 'Монгол' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली' },
  { code: 'no', name: 'Norwegian', native: 'Norsk' },
  { code: 'ny', name: 'Nyanja (Chichewa)', native: 'Chichewa' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ' },
  { code: 'ps', name: 'Pashto', native: 'پښتو', rtl: true },
  { code: 'fa', name: 'Persian', native: 'فارسی', rtl: true },
  { code: 'pl', name: 'Polish', native: 'Polski' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'ro', name: 'Romanian', native: 'Română' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'sm', name: 'Samoan', native: 'Gagana Samoa' },
  { code: 'sa', name: 'Sanskrit', native: 'संस्कृतम्' },
  { code: 'sat', name: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ' },
  { code: 'gd', name: 'Scottish Gaelic', native: 'Gàidhlig' },
  { code: 'sr', name: 'Serbian', native: 'Српски' },
  { code: 'st', name: 'Sesotho', native: 'Sesotho' },
  { code: 'sn', name: 'Shona', native: 'chiShona' },
  { code: 'sd', name: 'Sindhi', native: 'سنڌي', rtl: true },
  { code: 'si', name: 'Sinhala', native: 'සිංහල' },
  { code: 'sk', name: 'Slovak', native: 'Slovenčina' },
  { code: 'sl', name: 'Slovenian', native: 'Slovenščina' },
  { code: 'so', name: 'Somali', native: 'Soomaali' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'su', name: 'Sundanese', native: 'Basa Sunda' },
  { code: 'sw', name: 'Swahili', native: 'Kiswahili' },
  { code: 'sv', name: 'Swedish', native: 'Svenska' },
  { code: 'tg', name: 'Tajik', native: 'Тоҷикӣ' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'tt', name: 'Tatar', native: 'Татарча' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'th', name: 'Thai', native: 'ไทย' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe' },
  { code: 'tk', name: 'Turkmen', native: 'Türkmençe' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська' },
  { code: 'ur', name: 'Urdu', native: 'اردو', rtl: true },
  { code: 'ug', name: 'Uyghur', native: 'ئۇيغۇرچە', rtl: true },
  { code: 'uz', name: 'Uzbek', native: 'Oʻzbekcha' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'cy', name: 'Welsh', native: 'Cymraeg' },
  { code: 'xh', name: 'Xhosa', native: 'isiXhosa' },
  { code: 'yi', name: 'Yiddish', native: 'ייִדיש', rtl: true },
  { code: 'yo', name: 'Yoruba', native: 'Yorùbá' },
  { code: 'zu', name: 'Zulu', native: 'isiZulu' }
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code.toLowerCase(), l]));

// The language for a code (any letter case), or undefined when it is not one we offer.
export function findLanguage(code: string | null | undefined): LanguageInfo | undefined {
  return code ? BY_CODE.get(String(code).trim().toLowerCase()) : undefined;
}

// A code we can trust: the language's own spelling of it, or English when it is unknown.
export function cleanLanguageCode(code: string | null | undefined): string {
  return findLanguage(code)?.code ?? DEFAULT_LANGUAGE;
}

export function isRtl(code: string | null | undefined): boolean {
  return !!findLanguage(code)?.rtl;
}

// The language the phone or browser is set to, when it is one we offer (used only as a suggestion, never applied silently).
export function deviceLanguage(languages: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages || [] : []): string {
  for (const l of languages) {
    const full = findLanguage(l);
    if (full) return full.code;
    const base = findLanguage(String(l).split('-')[0]);
    if (base) return base.code;
    if (/^(nb|nn)/i.test(l)) return 'no';
    if (/^tl/i.test(l)) return 'fil';
    if (/^iw/i.test(l)) return 'he';
    if (/^zh-(hk|mo|tw|hant)/i.test(l)) return 'zh-TW';
    if (/^zh/i.test(l)) return 'zh-CN';
  }
  return DEFAULT_LANGUAGE;
}

// Case-insensitive, accent-insensitive search over the English and native names and the code.
export function searchLanguages(query: string, list: readonly LanguageInfo[] = LANGUAGES): LanguageInfo[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = fold(query.trim());
  if (!q) return [...list];
  return list.filter((l) => fold(l.name).includes(q) || fold(l.native).includes(q) || l.code.toLowerCase().startsWith(q));
}
