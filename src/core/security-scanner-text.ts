import { decodedTextVariants } from './security-scanner-decoders.js';

function normalizeText(value: string): string {
  return collapseWhitespace(comparableText(stripInvisibleText(value)));
}

export function normalizedVariants(value: string): string[] {
  return uniqueStrings(decodedTextVariants(value).map(normalizeText));
}

export function stripInvisibleText(value: string): string {
  let result = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && !isInvisibleCodePoint(codePoint)) {
      result += character;
    }
  }

  return result;
}

export function hasHiddenCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && isInvisibleCodePoint(codePoint)) {
      return true;
    }
  }

  return false;
}

export function hasUnsafeControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (unsafeControlCodePoints().has(value.charCodeAt(index))) {
      return true;
    }
  }

  return false;
}

export function squashText(value: string): string {
  return value.replace(/[^a-z0-9]+/gu, '');
}

export function canSquashPhrase(phrase: string): boolean {
  return /^[a-z0-9 ]+$/u.test(phrase) && phrase.includes(' ');
}

function comparableText(value: string): string {
  return replaceLeetCharacters(replaceConfusables(value.toLowerCase()));
}

function collapseWhitespace(value: string): string {
  return value.split(/\s+/u).join(' ').trim();
}

function isInvisibleCodePoint(codePoint: number): boolean {
  return (
    zeroWidthCodePoints().has(codePoint) ||
    inRange(codePoint, 0xe0000, 0xe007f) ||
    inRange(codePoint, 0xfe00, 0xfe0f)
  );
}

function zeroWidthCodePoints(): Set<number> {
  return new Set([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);
}

function inRange(value: number, start: number, end: number): boolean {
  return value >= start && value <= end;
}

function unsafeControlCodePoints(): Set<number> {
  return new Set([
    ...range(0x00, 0x08),
    ...range(0x0b, 0x0c),
    ...range(0x0e, 0x1f),
    0x7f,
    0x9b,
  ]);
}

function range(start: number, end: number): number[] {
  const values: number[] = [];
  for (let value = start; value <= end; value += 1) {
    values.push(value);
  }

  return values;
}

function replaceConfusables(value: string): string {
  return Array.from(
    value,
    (character) => confusableMap()[character] ?? character,
  ).join('');
}

function replaceLeetCharacters(value: string): string {
  return Array.from(
    value,
    (character) => leetMap()[character] ?? character,
  ).join('');
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function confusableMap(): Record<string, string> {
  return {
    а: 'a',
    е: 'e',
    і: 'i',
    о: 'o',
    р: 'p',
    с: 'c',
    у: 'y',
    α: 'a',
    ε: 'e',
    ι: 'i',
    ο: 'o',
    ρ: 'p',
  };
}

function leetMap(): Record<string, string> {
  return {
    $: 's',
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '@': 'a',
  };
}
