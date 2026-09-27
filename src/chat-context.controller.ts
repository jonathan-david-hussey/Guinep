import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyService } from './api-key.service.js';
import {
  type ContextItemRole,
  type ModelContextItem,
  type OutputSink,
  type PrepareMemoryWriteRequest,
  type PrepareModelContextRequest,
  type PrepareOutputRequest,
  type PrepareRetrievalRequest,
  type SystemPromptPolicy,
  type SystemPromptPolicyRequest,
  type ValidateModelOutputRequest,
} from './core/contracts.js';
import {
  ContextGuardService,
  userContextItem,
} from './core/context-guard.service.js';
import { ModelOutputGuardService } from './core/model-output-guard.service.js';
import { defaultContext } from './core/operation-runtime.service.js';
import { OutputSafetyService } from './core/output-safety.service.js';
import { RetrievalGuardService } from './core/retrieval-guard.service.js';
import { SystemPromptPolicyService } from './core/system-prompt-policy.service.js';

@Controller('v1/chat/context')
export class ChatContextController {
  public constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly contextGuard: ContextGuardService,
    private readonly modelOutputGuard: ModelOutputGuardService,
    private readonly outputSafety: OutputSafetyService,
    private readonly retrievalGuard: RetrievalGuardService,
    private readonly systemPrompts: SystemPromptPolicyService,
  ) {}

  @Post('prepare')
  @HttpCode(200)
  prepareContext(
    @Headers('x-guinep-api-key') key: string | undefined,
    @Body() body: PrepareModelContextRequest,
  ): unknown {
    this.requireInvoke(key);
    return this.contextGuard.prepareForModel(
      messagesOf(body),
      defaultContext('chat'),
    );
  }

  @Post('system-prompt/build')
  @HttpCode(200)
  buildSystemPrompt(
    @Headers('x-guinep-api-key') key: string | undefined,
    @Body() body: SystemPromptPolicyRequest,
  ): unknown {
    this.requireInvoke(key);
    return this.systemPrompts.build(normalizedSystemPromptPolicy(body));
  }

  @Post('memory/prepare')
  @HttpCode(200)
  prepareMemoryWrite(
    @Headers('x-guinep-api-key') key: string | undefined,
    @Body() body: PrepareMemoryWriteRequest,
  ): unknown {
    this.requireInvoke(key);
    return this.contextGuard.prepareMemoryWrite(
      memoriesOf(body),
      defaultContext('chat'),
    );
  }

  @Post('retrieval/prepare')
  @HttpCode(200)
  prepareRetrieval(
    @Headers('x-guinep-api-key') key: string | undefined,
    @Body() body: PrepareRetrievalRequest,
  ): unknown {
    this.requireInvoke(key);
    return this.retrievalGuard.prepareRetrievedContent(
      body.items ?? [],
      defaultContext('chat'),
    );
  }

  @Post('output/prepare')
  @HttpCode(200)
  prepareOutput(
    @Headers('x-guinep-api-key') key: string | undefined,
    @Body() body: PrepareOutputRequest,
  ): unknown {
    this.requireInvoke(key);
    return this.outputSafety.prepare(body.content ?? '', sinkOf(body.sink));
  }

  @Post('model-output/validate')
  @HttpCode(200)
  validateModelOutput(
    @Headers('x-guinep-api-key') key: string | undefined,
    @Body() body: ValidateModelOutputRequest,
  ): unknown {
    this.requireInvoke(key);
    return this.modelOutputGuard.validate(
      body.output,
      body.schema ?? { type: 'object' },
    );
  }

  private requireInvoke(key: string | undefined): void {
    if (key !== this.apiKeys.invokeKey) {
      throw new UnauthorizedException();
    }
  }
}

function sinkOf(sink: OutputSink | undefined): OutputSink {
  if (
    sink === 'html' ||
    sink === 'json' ||
    sink === 'log' ||
    sink === 'markdown' ||
    sink === 'terminal'
  ) {
    return sink;
  }

  return 'json';
}

function normalizedSystemPromptPolicy(
  policy: SystemPromptPolicyRequest | undefined,
): SystemPromptPolicy {
  const normalized = baseSystemPromptPolicy(policy);
  return policy?.externalContentLabel === undefined
    ? normalized
    : { ...normalized, externalContentLabel: policy.externalContentLabel };
}

function baseSystemPromptPolicy(
  policy: SystemPromptPolicyRequest | undefined,
): SystemPromptPolicy {
  if (policy === undefined) {
    return {
      role: 'agent',
      allow: [],
      deny: [],
      capabilities: [],
    };
  }

  return {
    role: policy.role,
    allow: policy.allow ?? [],
    deny: policy.deny ?? [],
    capabilities: policy.capabilities ?? [],
  };
}

function messagesOf(
  request: PrepareModelContextRequest | undefined,
): ModelContextItem[] {
  return (request?.messages ?? []).map((message) =>
    userContextItem(roleOf(message.role), message.content ?? ''),
  );
}

function memoriesOf(
  request: PrepareMemoryWriteRequest | undefined,
): ModelContextItem[] {
  return (request?.memories ?? []).map((memory) =>
    userContextItem(roleOf(memory.role), memory.content ?? ''),
  );
}

function roleOf(role: ContextItemRole | undefined): ContextItemRole {
  if (role === 'assistant' || role === 'tool') {
    return role;
  }

  return 'user';
}
