export function scannerMessage(code: string): string {
  return messages()[code] ?? 'Text scanner raised a security signal.';
}

function messages(): Record<string, string> {
  return {
    context_exfiltration_text:
      'Text appears to request hidden context leakage.',
    context_text_limit_exceeded: 'Context text length exceeds policy.',
    control_characters: 'Text contains unsafe terminal control characters.',
    encoded_payload_text: 'Text contains a long encoded-looking payload.',
    hidden_characters: 'Text contains hidden Unicode characters.',
    instruction_like_text: 'Text contains instruction-like content.',
    markdown_image_url_channel:
      'Text contains a Markdown image URL with a query channel.',
    memory_text_limit_exceeded: 'Memory text length exceeds policy.',
    response_text_too_large: 'Response text length exceeds policy.',
    role_boundary_text: 'Text contains role or instruction boundary markers.',
    text_too_large: 'Text length exceeds the operation budget.',
    tool_directive_text: 'Text appears to direct tool execution.',
    url_exfiltration_channel: 'Text contains a URL with a query channel.',
  };
}
