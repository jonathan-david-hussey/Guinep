import { type SecuritySignal } from './contracts.js';

export function blockSignal(
  code: string,
  category: SecuritySignal['category'],
  path: string,
): SecuritySignal {
  return {
    code,
    category,
    path,
    severity: 'block',
    message: securityMessage(code),
  };
}

function securityMessage(code: string): string {
  return messages()[baseCode(code)] ?? 'Security policy denied the operation.';
}

function baseCode(code: string): string {
  return code.split(':')[0] ?? code;
}

function messages(): Record<string, string> {
  return {
    approval_required: 'Approval is required.',
    call_budget_exceeded: 'Call budget for this run was exceeded.',
    control_characters: 'Text contains unsafe terminal control characters.',
    hidden_characters: 'Text contains hidden Unicode characters.',
    instruction_like_text: 'Text contains instruction-like content.',
    context_exfiltration_text:
      'Text appears to request hidden context leakage.',
    effects_not_declared:
      'Agentic mutating operations must declare their side effects.',
    encoded_payload_text: 'Text contains a long encoded-looking payload.',
    grounding_required:
      'Required grounding evidence is missing from the tool call.',
    missing_capability: 'The caller is missing a required capability.',
    markdown_image_url_channel:
      'Text contains a Markdown image URL with a query channel.',
    minute_call_budget_exceeded:
      'Per-minute call budget for this operation was exceeded.',
    request_too_large: 'Request size exceeds the operation budget.',
    response_too_large: 'Response size exceeds the operation budget.',
    role_boundary_text: 'Text contains role or instruction boundary markers.',
    rule_of_two_approval_required:
      'Approval is required when untrusted agent context can combine sensitive data with an external side effect.',
    source_not_allowed: 'The caller source is not allowed for this operation.',
    text_too_large: 'Text length exceeds the operation budget.',
    tool_call_depth_exceeded: 'Tool call depth exceeds the operation budget.',
    tool_directive_text: 'Text appears to direct tool execution.',
    url_exfiltration_channel: 'Text contains a URL with a query channel.',
  };
}
