# Guinep

Guinep turns selected HTTP API operations into tools that agents and applications can call. An operation spec defines the input schema, request mapping, authentication, execution rules, and response shape. Guinep validates the call, injects server-side credentials, sends the HTTP request, and returns a bounded, redacted result.

The service is built with NestJS and stores connections, drafts, and published operations in memory. They must be loaded or published again after a restart.

## Run locally

Use Node.js `24.15.0` and npm `11.12.1` (see `.nvmrc` and `package.json`). In PowerShell:

```powershell
npm ci
$env:GUINEP_ADMIN_KEY = 'local-admin'
$env:GUINEP_API_KEY = 'local-invoke'
npm run start:dev
```

On macOS or Linux, set the same environment variables before running `npm run start:dev`.

In a second PowerShell window, run the built-in helpdesk demo and list the tool it publishes:

```powershell
curl.exe -X POST http://localhost:3000/v1/demo/helpdesk/run -H "x-guinep-admin-key: local-admin"
curl.exe http://localhost:3000/v1/agent-tools -H "x-guinep-api-key: local-invoke"
```

The demo uses a mocked helpdesk endpoint hosted by Guinep. It creates and validates a draft, tests it, publishes it, calls the resulting agent tool, and shows the context and security checks.

## Define an operation

An operation spec identifies a connection and describes how to turn validated input into an HTTP request. It can also set tool metadata, response transforms, retry rules, and execution limits. See the [helpdesk operation example](docs/helpdesk-ticket.example.json).

The main lifecycle uses these endpoints:

| Action                    | Endpoint                                                       | Key header           |
| ------------------------- | -------------------------------------------------------------- | -------------------- |
| Create a draft            | `POST /v1/operation-specs/drafts`                              | `x-guinep-admin-key` |
| Validate or test a draft  | `POST /v1/operation-specs/drafts/:draftId/validate` or `/test` | `x-guinep-admin-key` |
| Publish a draft           | `POST /v1/operation-specs/drafts/:draftId/publish`             | `x-guinep-admin-key` |
| List published operations | `GET /v1/operations`                                           | `x-guinep-api-key`   |
| Invoke an operation       | `POST /v1/operations/:operationId/invoke`                      | `x-guinep-api-key`   |

Use `PUT /v1/operation-specs/drafts/:draftId` to update a draft. Published operation views and tool schemas expose agent-facing details without returning the connection secret or internal request policy.

For startup publication, provide `GUINEP_CONFIG_FILE` or `GUINEP_CONFIG_JSON` with `connections` and `operations`; see the [startup config example](docs/startup-config.example.json). Connections can also be supplied through `GUINEP_CONNECTIONS`. Replace example endpoints and credentials before calling a real provider. Invalid startup operations stop the application from starting.

## Call operations as tools

- `GET /v1/agent-tools` lists published operations as agent-callable tools. `POST /v1/agent-tools/:toolName/call` invokes one by its tool name.
- `POST /mcp` provides a stateless JSON-RPC endpoint for `tools/list` and `tools/call`. It requires the invoke key, matching MCP headers, and protocol version `2026-07-28` in both the header and request metadata. MCP capabilities come from the server-side `GUINEP_MCP_CAPABILITIES` setting.
- `POST /v1/chat/context/prepare` checks material before model use. Related endpoints prepare memory writes, retrieved content, and rendered output; build system prompt constraints; and validate model output against JSON Schema.

## Execution and safety

Guinep checks input schemas and policies before mapping request fields. Connections hold credentials server-side. Operation policies control allowed hosts, schemes, methods, capabilities, approvals, call budgets, and request and response sizes. Outbound requests deny private-network targets and require HTTPS unless an operation explicitly allows otherwise.

Responses can be reduced, sorted, filtered, and redacted. Guinep scans untrusted text and can quarantine unsafe content before it reaches an agent. Admins can inspect recorded security decisions at `GET /v1/security-events` using `x-guinep-admin-key`.

## Checks and production build

```bash
npm test             # unit tests
npm run test:e2e     # HTTP end-to-end tests
npm run test:cov     # unit coverage
npm run quality      # typecheck, lint, format, audit, build, and tests
npm run build
npm run start:prod
```

`npm run security:corpus` builds the service and evaluates the scanner against the public sources in `docs/security-corpus-sources.json`. It needs network access and writes `reports/security-corpus-report.json`. See [QUALITY.md](QUALITY.md) for the repository's quality thresholds.

The pre-commit hook also runs Habit Hooks. Its CLI and project configuration are external prerequisites for committing through that hook.
