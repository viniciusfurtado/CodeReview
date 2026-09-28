import { describe, it, expect } from 'vitest';
import { extractJsonObject, coerceSeverity, parseFindingsJson } from './client';

describe('extractJsonObject', () => {
  it('returns the raw text when it is already plain JSON', () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it('strips a ```json fenced block', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('trims leading/trailing prose around the object', () => {
    expect(extractJsonObject('Here is the result:\n{"a":1}\nThanks!')).toBe('{"a":1}');
  });
});

describe('coerceSeverity', () => {
  it('accepts valid severities case-insensitively', () => {
    expect(coerceSeverity('error')).toBe('ERROR');
    expect(coerceSeverity('WARNING')).toBe('WARNING');
  });

  it('falls back to WARNING for anything else', () => {
    expect(coerceSeverity('bogus')).toBe('WARNING');
    expect(coerceSeverity(undefined)).toBe('WARNING');
  });
});

describe('parseFindingsJson', () => {
  it('parses summary and findings, defaulting missing optional fields', () => {
    const raw = JSON.stringify({
      summary: 'ok',
      findings: [{ filePath: 'a.ts', severity: 'ERROR', title: 't', message: 'm' }],
    });
    const parsed = parseFindingsJson(raw);
    expect(parsed.summary).toBe('ok');
    expect(parsed.findings).toEqual([
      { filePath: 'a.ts', line: null, severity: 'ERROR', title: 't', message: 'm', suggestion: null },
    ]);
  });

  it('defaults to an empty findings array when missing', () => {
    expect(parseFindingsJson(JSON.stringify({ summary: 'ok' })).findings).toEqual([]);
  });
});
