#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultPageSize = 100;
const defaultFetchTimeoutMs = 30_000;
const sourceProgressStep = 1_000;

const options = parseArgs(process.argv.slice(2));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, options.manifest);
const reportPath = resolve(root, options.report);
const scannerModule = resolve(root, 'dist/core/security-scanner.js');
const { scanTextContent } = await import(pathToFileURL(scannerModule));

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const selected =
  options.sourceIds.length === 0
    ? manifest
    : manifest.filter((source) => options.sourceIds.includes(source.id));

const summaries = [];
for (const source of selected) {
  writeLine(`Starting source: ${source.id}`);
  const summary = await evaluateSource(source);
  summaries.push(summary);
  printSourceSummary(summary);
}

const report = {
  generatedAt: new Date().toISOString(),
  manifest: options.manifest,
  summaries,
  totals: totalsFor(summaries),
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
printSummary(report);

if (
  !options.allowInaccessible &&
  summaries.some((item) => item.status !== 'ok')
) {
  process.exitCode = 1;
} else if (
  report.totals.falseNegatives > 0 ||
  report.totals.falsePositives > 0
) {
  process.exitCode = 1;
}

async function evaluateSource(source) {
  const summary = emptySummary(source);
  try {
    for await (const row of rowsFor(source)) {
      evaluateRow(summary, row);
      if (options.maxRows !== undefined && summary.rows >= options.maxRows) {
        break;
      }
    }

    summary.status = 'ok';
  } catch (error) {
    summary.status = 'failed';
    summary.error = error instanceof Error ? error.message : String(error);
  }

  return summary;
}

function evaluateRow(summary, row) {
  const textValues = textValuesFor(row.record, row.access);
  summary.rows += 1;
  summary.textValues += textValues.length;
  printSourceProgress(summary);

  const signals = scanTextContent(textValues, {
    textTooLargeCode: 'text_too_large',
  });
  const detected = signals.length > 0;
  const expected = expectedDetection(row.record, row.access);
  const sample = {
    id: row.id,
    expected,
    detected,
    signalCodes: [...new Set(signals.map((signal) => signal.code))],
    textHash: sha256(textValues.join('\n')),
  };

  recordOutcome(summary, expected, detected, sample);
}

function recordOutcome(summary, expected, detected, sample) {
  if (expected === true && detected) {
    summary.truePositives += 1;
  } else if (expected === true) {
    summary.falseNegatives += 1;
    pushSample(summary.misses, sample);
  } else if (expected === false && detected) {
    summary.falsePositives += 1;
    pushSample(summary.falsePositiveSamples, sample);
  } else if (expected === false) {
    summary.trueNegatives += 1;
  } else {
    summary.unlabeled += 1;
    if (detected) {
      summary.unlabeledDetected += 1;
    }
  }
}

function pushSample(samples, sample) {
  if (samples.length < options.sampleLimit) {
    samples.push(sample);
  }
}

async function* rowsFor(source) {
  const access = source.access;
  if (access.type === 'huggingFaceRows') {
    yield* huggingFaceRows(source, access);
  } else if (access.type === 'githubRawCsv') {
    yield* csvRows(source, access, await fetchText(access.url, authHeaders()));
  } else if (access.type === 'githubTree') {
    yield* githubTreeRows(source, access);
  } else {
    throw new Error(`Unsupported source access type: ${access.type}`);
  }
}

async function* huggingFaceRows(source, access) {
  for (const split of access.splits) {
    yield* huggingFaceSplitRows(source, access, split);
  }
}

async function* huggingFaceSplitRows(source, access, split) {
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total) {
    const page = await huggingFacePage(access, split, offset);
    total = page.total;
    yield* page.rows.map((row) => ({
      id: `${source.id}:${split}:${row.row_idx}`,
      access,
      record: row.row,
    }));
    offset = nextOffset(offset, page.rows.length);
  }
}

async function huggingFacePage(access, split, offset) {
  const url = huggingFaceRowsUrl(access, split, offset);
  const page = JSON.parse(await fetchText(url, hfHeaders(access)));
  return {
    rows: page.rows ?? [],
    total: Number(page.num_rows_total ?? page.num_rows ?? 0),
  };
}

function nextOffset(offset, rowCount) {
  return rowCount === 0 ? Number.POSITIVE_INFINITY : offset + defaultPageSize;
}

function huggingFaceRowsUrl(access, split, offset) {
  const params = new URLSearchParams({
    dataset: access.dataset,
    config: access.config,
    split,
    offset: String(offset),
    length: String(defaultPageSize),
  });
  return `https://datasets-server.huggingface.co/rows?${params.toString()}`;
}

async function* githubTreeRows(source, access) {
  const tree = await githubTree(access);
  for (const item of tree.tree ?? []) {
    if (item.type !== 'blob' || !includedPath(item.path, access)) {
      continue;
    }

    const text = await fetchText(
      rawGithubUrl(access, item.path),
      authHeaders(),
    );
    yield* rowsFromFile(source, access, item.path, text);
  }
}

async function githubTree(access) {
  const url = [
    'https://api.github.com/repos',
    access.owner,
    access.repo,
    'git/trees',
    access.ref,
  ].join('/');
  return JSON.parse(await fetchText(`${url}?recursive=1`, authHeaders()));
}

function includedPath(path, access) {
  return (
    access.roots.some((rootPath) => inRoot(path, rootPath)) &&
    access.extensions.some((extension) => path.endsWith(extension))
  );
}

function inRoot(path, rootPath) {
  return (
    rootPath === '.' || path === rootPath || path.startsWith(`${rootPath}/`)
  );
}

function rawGithubUrl(access, path) {
  return [
    'https://raw.githubusercontent.com',
    access.owner,
    access.repo,
    access.ref,
    path,
  ].join('/');
}

async function* rowsFromFile(source, access, path, text) {
  if (path.endsWith('.csv')) {
    yield* csvRows(source, access, text, path);
  } else if (path.endsWith('.jsonl')) {
    yield* jsonlRows(source, access, text, path);
  } else if (path.endsWith('.json')) {
    yield* jsonRows(source, access, text, path);
  } else {
    yield textRow(source, access, path, text);
  }
}

async function* csvRows(source, access, text, path = 'raw.csv') {
  const [header, ...rows] = parseCsv(text);
  if (header === undefined) {
    return;
  }

  for (let index = 0; index < rows.length; index += 1) {
    yield {
      id: `${source.id}:${path}:${index}`,
      access,
      record: Object.fromEntries(
        header.map((name, column) => [name, rows[index]?.[column] ?? '']),
      ),
    };
  }
}

async function* jsonlRows(source, access, text, path) {
  const lines = text.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  for (let index = 0; index < lines.length; index += 1) {
    yield {
      id: `${source.id}:${path}:${index}`,
      access,
      record: JSON.parse(lines[index]),
    };
  }
}

async function* jsonRows(source, access, text, path) {
  for (const [index, record] of flattenRecords(JSON.parse(text)).entries()) {
    yield { id: `${source.id}:${path}:${index}`, access, record };
  }
}

function textRow(source, access, path, text) {
  return { id: `${source.id}:${path}`, access, record: { text } };
}

function flattenRecords(value) {
  if (Array.isArray(value)) {
    return value.flatMap(flattenRecords);
  }

  if (isRecord(value)) {
    return [value];
  }

  return [{ text: String(value) }];
}

function textValuesFor(record, access) {
  const values = access.textFields.flatMap((field) => stringsAt(record, field));
  return values.length > 0 ? values : allStrings(record);
}

function stringsAt(record, field) {
  return allStrings(readPath(record, field));
}

function readPath(record, field) {
  return field.split('.').reduce((current, key) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[key];
  }, record);
}

function allStrings(value) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(allStrings);
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.values(value).flatMap(allStrings);
}

function expectedDetection(record, access) {
  if (access.labelField !== undefined) {
    const value = String(readPath(record, access.labelField)).toLowerCase();
    if ((access.maliciousValues ?? []).includes(value)) {
      return true;
    }

    if ((access.benignValues ?? []).includes(value)) {
      return false;
    }
  }

  return access.defaultExpectedDetection;
}

function parseCsv(text) {
  let state = initialCsvState();
  for (let index = 0; index < text.length; index += 1) {
    const next = consumeCsvCharacter(text, index, state);
    state = next.state;
    index = next.index;
  }

  return finishCsvRows(state);
}

function initialCsvState() {
  return { rows: [], row: [], cell: '', quoted: false };
}

function consumeCsvCharacter(text, index, state) {
  const char = text[index];
  if (isEscapedQuote(text, index, state)) {
    return { index: index + 1, state: appendCsvCellText(state, '"') };
  }

  if (char === '"') {
    return { index, state: { ...state, quoted: !state.quoted } };
  }

  return consumeCsvDelimiterOrText(text, index, state);
}

function consumeCsvDelimiterOrText(text, index, state) {
  const char = text[index];
  if (char === ',' && !state.quoted) {
    return { index, state: finishCsvCell(state) };
  }

  if (isCsvNewline(char, state)) {
    return finishCsvLine(text, index, state);
  }

  return { index, state: appendCsvCellText(state, char ?? '') };
}

function finishCsvRows(state) {
  return state.cell.length > 0 || state.row.length > 0
    ? [...state.rows, [...state.row, state.cell]]
    : state.rows;
}

function finishCsvCell(state) {
  return { ...state, row: [...state.row, state.cell], cell: '' };
}

function finishCsvLine(text, index, state) {
  return {
    index: isCrLf(text, index) ? index + 1 : index,
    state: {
      ...state,
      rows: [...state.rows, [...state.row, state.cell]],
      row: [],
      cell: '',
    },
  };
}

function appendCsvCellText(state, value) {
  return { ...state, cell: `${state.cell}${value}` };
}

function isEscapedQuote(text, index, state) {
  return state.quoted && text[index] === '"' && text[index + 1] === '"';
}

function isCsvNewline(char, state) {
  return (char === '\n' || char === '\r') && !state.quoted;
}

function isCrLf(text, index) {
  return text[index] === '\r' && text[index + 1] === '\n';
}

async function fetchText(url, headers) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(defaultFetchTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }

  return response.text();
}

function hfHeaders(access) {
  if (access.requiresAuthentication && process.env.HF_TOKEN === undefined) {
    throw new Error(`${access.dataset} requires HF_TOKEN and accepted terms`);
  }

  return process.env.HF_TOKEN === undefined
    ? authHeaders()
    : { ...authHeaders(), Authorization: `Bearer ${process.env.HF_TOKEN}` };
}

function authHeaders() {
  return process.env.GITHUB_TOKEN === undefined
    ? {}
    : { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` };
}

function totalsFor(summaries) {
  return summaries.reduce(
    (totals, summary) => ({
      rows: totals.rows + summary.rows,
      textValues: totals.textValues + summary.textValues,
      truePositives: totals.truePositives + summary.truePositives,
      trueNegatives: totals.trueNegatives + summary.trueNegatives,
      falseNegatives: totals.falseNegatives + summary.falseNegatives,
      falsePositives: totals.falsePositives + summary.falsePositives,
      unlabeled: totals.unlabeled + summary.unlabeled,
      unlabeledDetected: totals.unlabeledDetected + summary.unlabeledDetected,
      failedSources: totals.failedSources + (summary.status === 'ok' ? 0 : 1),
    }),
    {
      rows: 0,
      textValues: 0,
      truePositives: 0,
      trueNegatives: 0,
      falseNegatives: 0,
      falsePositives: 0,
      unlabeled: 0,
      unlabeledDetected: 0,
      failedSources: 0,
    },
  );
}

function emptySummary(source) {
  return {
    sourceId: source.id,
    status: 'pending',
    rows: 0,
    textValues: 0,
    truePositives: 0,
    trueNegatives: 0,
    falseNegatives: 0,
    falsePositives: 0,
    unlabeled: 0,
    unlabeledDetected: 0,
    misses: [],
    falsePositiveSamples: [],
  };
}

function printSummary(report) {
  writeLine(`Security corpus report: ${options.report}`);
  writeLine(`Rows: ${report.totals.rows}`);
  writeLine(`Text values: ${report.totals.textValues}`);
  writeLine(`False negatives: ${report.totals.falseNegatives}`);
  writeLine(`False positives: ${report.totals.falsePositives}`);
  writeLine(`Failed sources: ${report.totals.failedSources}`);
}

function printSourceProgress(summary) {
  if (summary.rows > 0 && summary.rows % sourceProgressStep === 0) {
    writeLine(`  ${summary.sourceId}: ${summary.rows} rows`);
  }
}

function printSourceSummary(summary) {
  writeLine(
    [
      `Finished source: ${summary.sourceId}`,
      `status=${summary.status}`,
      `rows=${summary.rows}`,
      `falseNegatives=${summary.falseNegatives}`,
      `falsePositives=${summary.falsePositives}`,
    ].join(' '),
  );
}

function writeLine(value) {
  process.stdout.write(`${value}\n`);
}

function parseArgs(args) {
  const parsed = {
    allowInaccessible: false,
    manifest: 'docs/security-corpus-sources.json',
    maxRows: undefined,
    report: 'reports/security-corpus-report.json',
    sampleLimit: 25,
    sourceIds: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--allow-inaccessible') {
      parsed.allowInaccessible = true;
    } else if (arg === '--manifest') {
      parsed.manifest = requiredValue(args, index);
      index += 1;
    } else if (arg === '--max-rows') {
      parsed.maxRows = Number(requiredValue(args, index));
      index += 1;
    } else if (arg === '--report') {
      parsed.report = requiredValue(args, index);
      index += 1;
    } else if (arg === '--sample-limit') {
      parsed.sampleLimit = Number(requiredValue(args, index));
      index += 1;
    } else if (arg === '--source') {
      parsed.sourceIds.push(requiredValue(args, index));
      index += 1;
    }
  }

  return parsed;
}

function requiredValue(args, index) {
  const value = args[index + 1];
  if (value === undefined) {
    throw new Error(`Missing value for ${args[index]}`);
  }

  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
