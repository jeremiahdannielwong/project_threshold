/**
 * Lightweight i18n for the resident-facing surface.
 *
 * Brampton is ~25% Punjabi-speaking and ~14% Hindi/Urdu-speaking. The
 * Resident view, the printed advisories, and the resident push payloads
 * all need first-class translation. Operator chrome stays English in v1
 * since municipal staff operate in English; expanding language coverage
 * to the operator surface is a Phase-2 decision based on tenant.
 *
 * Strings are hand-translated for v1. Future versions can pipe through
 * a managed translation service (Phrase, Lokalise, etc.) keyed by `key`.
 */

export type Locale = 'en' | 'pa' | 'hi';

export const LOCALE_LABEL: Record<Locale, { label: string; native: string }> = {
  en: { label: 'English',  native: 'English'  },
  pa: { label: 'Punjabi',  native: 'ਪੰਜਾਬੀ'   },
  hi: { label: 'Hindi',    native: 'हिन्दी'    },
};

type Strings = {
  brand: string;
  subtitle: string;
  backToOperator: string;
  findNeighbourhood: string;
  searchPlaceholder: string;
  noMatches: string;
  preparednessForResidents: string;
  whatIsBeingDone: string;
  whatIsBeingDoneDesc: string;
  aboutYourNeighbourhood: string;
  renterHouseholds: string;
  pre1980Housing: string;
  lowIncomeShare: string;
  coolingCentres: string;
  none: string;
  provenance: string;
  noAdvisories: string;
  residents: string;
  ctPrefix: string;
  baseline: string;
  elevated: string;
  high: string;
  critical: string;
};

const en: Strings = {
  brand: 'Threshold',
  subtitle: 'Brampton · Preparedness',
  backToOperator: '↩ Operator view',
  findNeighbourhood: 'Find your neighbourhood',
  searchPlaceholder: 'Search neighbourhood…',
  noMatches: 'No matches.',
  preparednessForResidents: 'Preparedness for residents',
  whatIsBeingDone: 'What is being recommended for your area',
  whatIsBeingDoneDesc:
    'The same intelligence layer surfaces these recommendations to community organizations and municipal operators. They are not commitments — they are derived recommendations.',
  aboutYourNeighbourhood: 'About your neighbourhood',
  renterHouseholds: 'Renter households',
  pre1980Housing: 'Pre-1980 housing',
  lowIncomeShare: 'Low-income share',
  coolingCentres: 'Cooling / warming centres within 2.5 km',
  none: 'none',
  provenance:
    'These advisories are derived from public data — the 2021 Statistics Canada census, the Social Vulnerability Index, the Alectra live outage feed, Open-Meteo weather, the Ontario Energy Board Regulated Price Plan, and the Bank of Canada CPI series — applied to your tract under the active scenario. Each advisory cites the values that triggered it. No language model is invoked. This page is a public preparedness surface, not a chat interface.',
  noAdvisories:
    'Under the active conditions, no resident-tier preparedness thresholds are currently crossed for your neighbourhood. Conditions are within baseline parameters.',
  residents: 'residents',
  ctPrefix: 'CT',
  baseline: 'Baseline',
  elevated: 'Elevated',
  high: 'High',
  critical: 'Critical',
};

const pa: Strings = {
  brand: 'ਥ੍ਰੈਸ਼ੋਲਡ',
  subtitle: 'ਬ੍ਰੈਮਪਟਨ · ਤਿਆਰੀ',
  backToOperator: '↩ ਅਪਰੇਟਰ ਦ੍ਰਿਸ਼',
  findNeighbourhood: 'ਆਪਣਾ ਇਲਾਕਾ ਲੱਭੋ',
  searchPlaceholder: 'ਇਲਾਕਾ ਲੱਭੋ…',
  noMatches: 'ਕੋਈ ਮੇਲ ਨਹੀਂ।',
  preparednessForResidents: 'ਨਿਵਾਸੀਆਂ ਲਈ ਤਿਆਰੀ',
  whatIsBeingDone: 'ਤੁਹਾਡੇ ਇਲਾਕੇ ਲਈ ਕੀ ਸਿਫ਼ਾਰਸ਼ ਕੀਤੀ ਜਾ ਰਹੀ ਹੈ',
  whatIsBeingDoneDesc:
    'ਇਹ ਸਿਫ਼ਾਰਸ਼ਾਂ ਉਹੀ ਖੁਫੀਆ ਪਰਤ ਕਮਿਊਨਿਟੀ ਸੰਸਥਾਵਾਂ ਅਤੇ ਨਗਰਪਾਲਿਕਾ ਪ੍ਰਬੰਧਕਾਂ ਨੂੰ ਪ੍ਰਦਾਨ ਕਰਦੀ ਹੈ। ਇਹ ਵਚਨ ਨਹੀਂ — ਇਹ ਡੇਟਾ ਤੋਂ ਉਤਪੰਨ ਸਿਫ਼ਾਰਸ਼ਾਂ ਹਨ।',
  aboutYourNeighbourhood: 'ਤੁਹਾਡੇ ਇਲਾਕੇ ਬਾਰੇ',
  renterHouseholds: 'ਕਿਰਾਏਦਾਰ ਘਰ',
  pre1980Housing: '1980 ਤੋਂ ਪਹਿਲਾਂ ਦਾ ਘਰ',
  lowIncomeShare: 'ਘੱਟ ਆਮਦਨ ਹਿੱਸਾ',
  coolingCentres: '2.5 km ਅੰਦਰ ਠੰਡਾ ਕਰਨ / ਗਰਮ ਕਰਨ ਕੇਂਦਰ',
  none: 'ਕੋਈ ਨਹੀਂ',
  provenance:
    'ਇਹ ਸਲਾਹਾਂ ਜਨਤਕ ਡੇਟਾ — 2021 ਸਟੈਟਿਸਟਿਕਸ ਕੈਨੇਡਾ ਜਨਗਣਨਾ, ਸਮਾਜਿਕ ਕਮਜ਼ੋਰੀ ਸੂਚਕਾਂਕ, Alectra ਲਾਈਵ ਆਉਟੇਜ ਫੀਡ, Open-Meteo ਮੌਸਮ, ਅਤੇ ਬੈਂਕ ਆਫ਼ ਕੈਨੇਡਾ CPI ਲੜੀ — ਤੋਂ ਉਤਪੰਨ ਕੀਤੀਆਂ ਗਈਆਂ ਹਨ। ਹਰੇਕ ਸਲਾਹ ਉਹਨਾਂ ਮੁੱਲਾਂ ਦਾ ਹਵਾਲਾ ਦਿੰਦੀ ਹੈ ਜਿਨ੍ਹਾਂ ਨੇ ਇਸ ਨੂੰ ਸ਼ੁਰੂ ਕੀਤਾ। ਕੋਈ ਭਾਸ਼ਾ ਮਾਡਲ ਨਹੀਂ ਵਰਤਿਆ ਜਾਂਦਾ।',
  noAdvisories:
    'ਮੌਜੂਦਾ ਹਾਲਾਤਾਂ ਵਿੱਚ, ਤੁਹਾਡੇ ਇਲਾਕੇ ਲਈ ਕੋਈ ਨਿਵਾਸੀ-ਪੱਧਰ ਤਿਆਰੀ ਸੀਮਾਵਾਂ ਪਾਰ ਨਹੀਂ ਹੋਈਆਂ। ਹਾਲਾਤ ਆਮ ਸੀਮਾਵਾਂ ਅੰਦਰ ਹਨ।',
  residents: 'ਨਿਵਾਸੀ',
  ctPrefix: 'CT',
  baseline: 'ਆਮ',
  elevated: 'ਵਧਿਆ',
  high: 'ਉੱਚਾ',
  critical: 'ਨਾਜ਼ੁਕ',
};

const hi: Strings = {
  brand: 'थ्रेशोल्ड',
  subtitle: 'ब्रैम्पटन · तैयारी',
  backToOperator: '↩ ऑपरेटर दृश्य',
  findNeighbourhood: 'अपना पड़ोस खोजें',
  searchPlaceholder: 'पड़ोस खोजें…',
  noMatches: 'कोई मेल नहीं।',
  preparednessForResidents: 'निवासियों के लिए तैयारी',
  whatIsBeingDone: 'आपके क्षेत्र के लिए क्या अनुशंसित है',
  whatIsBeingDoneDesc:
    'यह सिफ़ारिशें वही ख़ुफ़िया परत समुदाय संगठनों और नगरपालिका ऑपरेटरों को प्रदान करती है। ये वचन नहीं — ये डेटा से व्युत्पन्न सिफ़ारिशें हैं।',
  aboutYourNeighbourhood: 'आपके पड़ोस के बारे में',
  renterHouseholds: 'किरायेदार घर',
  pre1980Housing: '1980 से पहले के घर',
  lowIncomeShare: 'कम-आय हिस्सा',
  coolingCentres: '2.5 km के भीतर शीतलन / गर्म केंद्र',
  none: 'कोई नहीं',
  provenance:
    'ये सलाहें सार्वजनिक डेटा — 2021 स्टैटिस्टिक्स कनाडा जनगणना, सामाजिक भेद्यता सूचकांक, Alectra लाइव आउटेज फ़ीड, Open-Meteo मौसम, और बैंक ऑफ़ कनाडा CPI श्रृंखला — से व्युत्पन्न हैं। प्रत्येक सलाह उन मानों का हवाला देती है जिन्होंने उसे ट्रिगर किया। कोई भाषा मॉडल नहीं उपयोग किया गया।',
  noAdvisories:
    'वर्तमान परिस्थितियों में, आपके पड़ोस के लिए कोई निवासी-स्तर तैयारी सीमा पार नहीं हुई है। स्थितियाँ बेसलाइन मापदंडों के भीतर हैं।',
  residents: 'निवासी',
  ctPrefix: 'CT',
  baseline: 'बेसलाइन',
  elevated: 'बढ़ा हुआ',
  high: 'उच्च',
  critical: 'गंभीर',
};

export const STRINGS: Record<Locale, Strings> = { en, pa, hi };

export function t(locale: Locale, key: keyof Strings): string {
  return STRINGS[locale][key] ?? STRINGS.en[key] ?? key;
}
