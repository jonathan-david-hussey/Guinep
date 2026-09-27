export function hasLongEncodedToken(value: string): boolean {
  return value
    .split(' ')
    .some((token) => isLongBase64Token(token) || isLongHexToken(token));
}

export function hasUrlWithQuery(value: string): boolean {
  const index = value.indexOf('http');
  if (index < 0) {
    return false;
  }

  const candidate = value.slice(index).split(' ')[0] ?? '';
  return candidate.startsWith('http') && candidate.includes('?');
}

export function hasMarkdownImageUrlWithQuery(value: string): boolean {
  const marker = '](';
  const imageIndex = value.indexOf('![');
  if (imageIndex < 0) {
    return false;
  }

  const urlStart = value.indexOf(marker, imageIndex);
  if (urlStart < 0) {
    return false;
  }

  const url = value.slice(urlStart + marker.length).split(')')[0] ?? '';
  return url.startsWith('http') && url.includes('?');
}

export function hasNamedToolDirective(value: string): boolean {
  return toolDirectivePatterns().some((pattern) => pattern.test(value));
}

export function hasPayloadSplitDirective(value: string): boolean {
  return (
    (/\b(?:first|part one|part 1)\b/u.test(value) &&
      /\b(?:second|part two|part 2)\b/u.test(value) &&
      /\b(?:concatenate|combine|join)\b/u.test(value) &&
      /\b(?:do|follow|execute|obey|perform|run)\b/u.test(value)) ||
    hasLeftRightPayloadSplitDirective(value)
  );
}

function hasLeftRightPayloadSplitDirective(value: string): boolean {
  return (
    /\b(?:left|a|x)\b/u.test(value) &&
    /\b(?:right|b|y)\b/u.test(value) &&
    /\b(?:concatenate|combine|followed by|join)\b/u.test(value) &&
    /\b(?:act|do|follow|execute|obey|perform|run)\b/u.test(value)
  );
}

function toolDirectivePatterns(): RegExp[] {
  return [
    /\b(?:call|use|invoke|run)\s+(?:the\s+)?[a-z0-9_-]{1,64}\s+tool\b/u,
    /\b(?:call|invoke|execute)\s+(?:the\s+)?[a-z0-9_-]{1,64}\s+function\b/u,
  ];
}

function isLongBase64Token(token: string): boolean {
  return token.length >= 80 && allCharsIn(token, base64Chars());
}

function isLongHexToken(token: string): boolean {
  return token.length >= 64 && allCharsIn(token, hexChars());
}

function allCharsIn(value: string, allowed: Set<string>): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!allowed.has(value.charAt(index))) {
      return false;
    }
  }

  return value.length > 0;
}

function base64Chars(): Set<string> {
  return charSet(
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=',
  );
}

function hexChars(): Set<string> {
  return charSet('abcdef0123456789');
}

function charSet(value: string): Set<string> {
  return new Set(value.split(''));
}
