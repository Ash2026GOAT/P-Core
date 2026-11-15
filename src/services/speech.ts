export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [altIndex: number]: {
        transcript: string;
      };
    };
  };
}

export interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

export interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

const VOICE_PRIORITY = [
  'Google UK English Male',
  'Microsoft Ryan',
  'Microsoft George',
  'Daniel',
] as const;

export function selectJarvisVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  for (const targetName of VOICE_PRIORITY) {
    const exactMatch = voices.find(
      (v) => v.name.toLowerCase() === targetName.toLowerCase()
    );
    if (exactMatch) return exactMatch;

    const partialMatch = voices.find((v) =>
      v.name.toLowerCase().includes(targetName.toLowerCase())
    );
    if (partialMatch) return partialMatch;
  }

  const anyEnGb = voices.find((v) => {
    const lang = v.lang.toLowerCase().replace('_', '-');
    return lang === 'en-gb' || lang.startsWith('en-gb-');
  });
  if (anyEnGb) return anyEnGb;

  return voices.find((v) => v.lang.toLowerCase().startsWith('en')) ?? voices[0] ?? null;
}

export function stripMarkdownForSpeech(markdown: string): string {
  if (!markdown) return '';

  let text = markdown;

  // Remove fenced code blocks completely so raw syntax isn't read aloud
  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/~~~[\s\S]*?~~~/g, ' ');

  // Convert Markdown images ![alt](url) -> alt
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Convert Markdown links [label](url) -> label
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // Remove reference-style link definitions [id]: https://...
  text = text.replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '');

  // Strip inline code backticks while keeping the spoken identifier
  text = text.replace(/`([^`]+)`/g, '$1');

  // Remove table separator rows (e.g. | --- | :---: |)
  text = text.replace(/^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-*:?\s*\|?\s*$/gm, '');
  // Replace table pipes with commas/spaces for natural cadence
  text = text.replace(/\|/g, ', ');

  // Remove heading markers (#, ##, ...)
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');

  // Remove blockquote markers
  text = text.replace(/^\s{0,3}>\s?/gm, '');

  // Remove horizontal rules
  text = text.replace(/^\s{0,3}([-*_])\s*(\1\s*){2,}$/gm, '');

  // Remove unordered/ordered list bullets at line starts
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');

  // Remove emphasis/strikethrough/remaining markdown symbols (*, _, ~, #, `)
  text = text.replace(/[*_~#`]+/g, '');

  // Strip simple HTML tags if any
  text = text.replace(/<[^>]+>/g, ' ');

  // Collapse excess whitespace and newlines into natural pauses
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/(?:\.\s*){2,}/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return text;
}

export function splitIntoSpeechChunks(text: string, maxChunkLength = 220): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChunkLength) return [cleaned];

  const sentences = cleaned.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [cleaned];
  const chunks: string[] = [];
  let current = '';

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if (!current) {
      current = sentence;
    } else if (current.length + 1 + sentence.length <= maxChunkLength) {
      current = `${current} ${sentence}`;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}
