import { Injectable } from '@nestjs/common';
import { type OutputSink, type PrepareOutputResponse } from './contracts.js';
import { isRecord } from './path-utils.js';
import {
  scanTextContent,
  stripInvisibleCharacters,
} from './security-scanner.js';

@Injectable()
export class OutputSafetyService {
  prepare(content: unknown, sink: OutputSink = 'json'): PrepareOutputResponse {
    const output = neutralize(content, sink);
    const signals = scanTextContent(content, {
      textTooLargeCode: 'output_text_limit_exceeded',
    });
    return { sink, content: output, signals };
  }
}

function neutralize(value: unknown, sink: OutputSink): unknown {
  if (typeof value === 'string') {
    return neutralizeString(stripInvisibleString(value), sink);
  }

  if (Array.isArray(value)) {
    return value.map((child) => neutralize(child, sink));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, neutralize(child, sink)]),
  );
}

function stripInvisibleString(value: string): string {
  return stripInvisibleCharacters(value) as string;
}

function neutralizeString(value: string, sink: OutputSink): string {
  const withoutControls =
    sink === 'terminal' || sink === 'log'
      ? removeUnsafeControlCharacters(value)
      : value;
  if (sink === 'html') {
    return escapeHtml(withoutControls);
  }

  if (sink === 'markdown') {
    return disableMarkdownImages(withoutControls);
  }

  return withoutControls;
}

function removeUnsafeControlCharacters(value: string): string {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (!isUnsafeControlCodePoint(codePoint)) {
      result += value.charAt(index);
    }
  }

  return result;
}

function isUnsafeControlCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x00 && codePoint <= 0x08) ||
    (codePoint >= 0x0b && codePoint <= 0x0c) ||
    (codePoint >= 0x0e && codePoint <= 0x1f) ||
    codePoint === 0x7f ||
    codePoint === 0x9b
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function disableMarkdownImages(value: string): string {
  return value.replaceAll('![', '[image disabled: ');
}
