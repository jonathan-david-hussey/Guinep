import { type SecuritySignal } from './contracts.js';
import { isRecord } from './path-utils.js';
import { textLeaves, type TextLeaf } from './security-scanner-leaves.js';
import {
  hasLongEncodedToken,
  hasMarkdownImageUrlWithQuery,
  hasNamedToolDirective,
  hasPayloadSplitDirective,
  hasUrlWithQuery,
} from './security-scanner-patterns.js';
import { phraseRules, toolDirectivePhrases } from './security-scanner-rules.js';
import {
  canSquashPhrase,
  hasHiddenCharacter,
  hasUnsafeControlCharacter,
  normalizedVariants,
  squashText,
  stripInvisibleText,
} from './security-scanner-text.js';
import {
  scannerBlockSignal,
  scannerWarningSignal,
} from './security-scanner-signals.js';

export interface TextScanOptions {
  maxTextLength?: number;
  textTooLargeCode: string;
  basePath?: string;
}

export function scanTextContent(
  value: unknown,
  options: TextScanOptions,
): SecuritySignal[] {
  return textLeaves(value, options.basePath ?? '$').flatMap((entry) =>
    scanTextLeaf(entry, options),
  );
}

export function stripInvisibleCharacters(value: unknown): unknown {
  if (typeof value === 'string') {
    return stripInvisibleText(value);
  }

  if (Array.isArray(value)) {
    return value.map(stripInvisibleCharacters);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      stripInvisibleCharacters(child),
    ]),
  );
}

function scanTextLeaf(
  entry: TextLeaf,
  options: TextScanOptions,
): SecuritySignal[] {
  const cheapSignals = [
    ...textLengthSignal(entry, options),
    ...hiddenCharacterSignal(entry),
    ...controlCharacterSignal(entry),
  ];
  if (cheapSignals.some((signal) => signal.severity === 'block')) {
    return cheapSignals;
  }

  const variants = normalizedVariants(entry.value);
  return [
    ...cheapSignals,
    ...phraseSignals(entry, variants),
    ...payloadSplitSignal(entry, variants),
    ...toolDirectiveSignal(entry, variants),
    ...encodedPayloadSignal(entry, variants),
    ...urlChannelSignal(entry, variants),
    ...markdownImageSignal(entry, variants),
  ];
}

function textLengthSignal(
  entry: TextLeaf,
  options: TextScanOptions,
): SecuritySignal[] {
  return limitExceeded(entry.value.length, options.maxTextLength)
    ? [scannerBlockSignal(options.textTooLargeCode, 'budget', entry.path)]
    : [];
}

function hiddenCharacterSignal(entry: TextLeaf): SecuritySignal[] {
  return hasHiddenCharacter(entry.value)
    ? [scannerWarningSignal('hidden_characters', entry.path)]
    : [];
}

function controlCharacterSignal(entry: TextLeaf): SecuritySignal[] {
  return hasUnsafeControlCharacter(entry.value)
    ? [scannerWarningSignal('control_characters', entry.path)]
    : [];
}

function phraseSignals(
  entry: { path: string },
  variants: string[],
): SecuritySignal[] {
  return phraseRules()
    .filter((rule) => containsAnyVariant(variants, rule.phrases))
    .map((rule) => scannerWarningSignal(rule.code, entry.path));
}

function payloadSplitSignal(
  entry: { path: string },
  variants: string[],
): SecuritySignal[] {
  return variants.some(hasPayloadSplitDirective)
    ? [scannerWarningSignal('instruction_like_text', entry.path)]
    : [];
}

function toolDirectiveSignal(
  entry: { path: string },
  variants: string[],
): SecuritySignal[] {
  return containsAnyVariant(variants, toolDirectivePhrases) ||
    variants.some(hasNamedToolDirective)
    ? [scannerWarningSignal('tool_directive_text', entry.path)]
    : [];
}

function encodedPayloadSignal(
  entry: { path: string },
  variants: string[],
): SecuritySignal[] {
  return variants.some(hasLongEncodedToken)
    ? [scannerWarningSignal('encoded_payload_text', entry.path)]
    : [];
}

function urlChannelSignal(
  entry: { path: string },
  variants: string[],
): SecuritySignal[] {
  return variants.some(hasUrlWithQuery)
    ? [scannerWarningSignal('url_exfiltration_channel', entry.path)]
    : [];
}

function markdownImageSignal(
  entry: { path: string },
  variants: string[],
): SecuritySignal[] {
  return variants.some(hasMarkdownImageUrlWithQuery)
    ? [scannerWarningSignal('markdown_image_url_channel', entry.path)]
    : [];
}

function containsAnyVariant(values: string[], phrases: string[]): boolean {
  return values.some((value) => containsAny(value, phrases));
}

function containsAny(value: string, phrases: string[]): boolean {
  const squashedValue = squashText(value);
  return phrases.some(
    (phrase) =>
      value.includes(phrase) ||
      (canSquashPhrase(phrase) && squashedValue.includes(squashText(phrase))),
  );
}

function limitExceeded(value: number, limit: number | undefined): boolean {
  return limit !== undefined && value > limit;
}
