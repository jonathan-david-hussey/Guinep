export function scanOptions(): { textTooLargeCode: string } {
  return { textTooLargeCode: 'text_too_large' };
}

export function codes(signals: { code: string }[]): string[] {
  return signals.map((signal) => signal.code);
}
