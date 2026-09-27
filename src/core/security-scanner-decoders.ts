export function decodedTextVariants(value: string): string[] {
  return [
    value,
    decodePercentText(value),
    decodeHtmlNumericEntities(value),
    decodeExplicitBase64(value),
    decodeExplicitHex(value),
    rot13(value),
    reverseText(value),
  ];
}

function decodePercentText(value: string): string {
  try {
    return decodeURIComponent(value.replaceAll('+', ' '));
  } catch {
    return value;
  }
}

function decodeHtmlNumericEntities(value: string): string {
  return value.replace(
    /&#(?:x(?<hex>[0-9a-f]+)|(?<decimal>\d+));?/giu,
    (_match, hex: string | undefined, decimal: string | undefined) =>
      entityCharacter(hex, decimal),
  );
}

function decodeExplicitBase64(value: string): string {
  return appendDecodedMatches(
    value,
    /\bbase64\s+([a-z0-9+/=]{8,})\b/giu,
    'base64',
  );
}

function decodeExplicitHex(value: string): string {
  return appendDecodedMatches(value, /\bhex\s+([a-f0-9]{8,})\b/giu, 'hex');
}

function appendDecodedMatches(
  value: string,
  pattern: RegExp,
  encoding: BufferEncoding,
): string {
  const decodedValues = [...value.matchAll(pattern)]
    .map((match) => decodeBuffer(match[1] ?? '', encoding))
    .filter((decoded) => decoded.length > 0);
  return decodedValues.length === 0
    ? value
    : `${value} ${decodedValues.join(' ')}`;
}

function decodeBuffer(value: string, encoding: BufferEncoding): string {
  try {
    return Buffer.from(value, encoding).toString('utf8');
  } catch {
    return '';
  }
}

function entityCharacter(
  hex: string | undefined,
  decimal: string | undefined,
): string {
  const value = hex ?? decimal ?? '';
  const codePoint = Number.parseInt(value, hex === undefined ? 10 : 16);
  return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : '';
}

function rot13(value: string): string {
  return Array.from(value, (character) => rot13Character(character)).join('');
}

function rot13Character(character: string): string {
  const code = character.codePointAt(0);
  if (code === undefined) {
    return character;
  }

  if (code >= 65 && code <= 90) {
    return String.fromCodePoint(((code - 65 + 13) % 26) + 65);
  }

  return code >= 97 && code <= 122
    ? String.fromCodePoint(((code - 97 + 13) % 26) + 97)
    : character;
}

function reverseText(value: string): string {
  return Array.from(value).reverse().join('');
}
