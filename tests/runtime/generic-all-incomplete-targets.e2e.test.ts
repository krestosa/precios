import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootControlRuntime,
  containsScalar,
  executeAndWaitForState,
  getPath,
  isRecord,
  workbenchModel,
  type ControlApi,
} from './control-api-testkit';

const EDITABLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" viewBox="0 0 360 180">
  <text x="24" y="72" font-family="Arial" font-size="24"><tspan>$$$$</tspan></text>
  <text x="24" y="126" font-family="Arial" font-size="24"><tspan>@@@@</tspan></text>
</svg>`;

interface IncompleteGroup {
  readonly group: string;
  readonly normal: number;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function allIncompletePricingCsv(action: string, groups: readonly IncompleteGroup[]): string {
  const groupRow: Array<string | number> = ['', '', ''];
  const channelRow: Array<string | number> = ['', '', ''];
  const dataRow: Array<string | number> = ['', 'W1801', action];

  groups.forEach((entry) => {
    groupRow.push(entry.group, entry.group);
    channelRow.push('SALON', 'DELI');
    dataRow.push(entry.normal, entry.normal);
  });

  groupRow.push('', '');
  channelRow.push('', '');
  dataRow.push('W1801', action);

  groups.forEach((entry) => {
    groupRow.push(entry.group, entry.group);
    channelRow.push('SALON', 'DELI');
    dataRow.push('', '');
  });

  return [groupRow, channelRow, dataRow]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');
}

function asFile(content: string, name: string, type: string): File {
  return new File([content], name, { type });
}

function modelFiles(): Record<string, unknown>[] {
  const model = workbenchModel();
  if (!isRecord(model) || !Array.isArray(model.files)) return [];
  return model.files.filter(isRecord);
}

function sourceViews(sourceArtworkFileName: string): Record<string, unknown>[] {
  return modelFiles().filter((entry) => entry.sourceArtworkFileName === sourceArtworkFileName);
}

describe('W18 generic con todos los targets incompletos', () => {
  let api: ControlApi;

  beforeAll(async () => {
    ({ api } = await bootControlRuntime());
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    const reset = await api.execute('flow.reset');
    expect(reset.ok).toBe(true);
  });

  it('conserva cada target real, lo bloquea individualmente y no habilita ningún PNG', async () => {
    const action = 'Campaña Todos Incompletos 2031';
    const filename = `${action} Story 1.svg`;
    const groups = [
      { group: 'GENERAL', normal: 18100 },
      { group: 'PALERMO', normal: 28200 },
      { group: 'RECOVA', normal: 38300 },
    ] as const;
    const expectedGroups = groups.map((entry) => entry.group).sort();

    await executeAndWaitForState(
      api,
      'source.load',
      { files: asFile(allIncompletePricingCsv(action, groups), 'w18-all-incomplete.csv', 'text/csv') },
      (state) => getPath(state, 'source', 'status') === 'ready',
    );
    await executeAndWaitForState(
      api,
      'svg.load',
      { files: asFile(EDITABLE_SVG, filename, 'image/svg+xml') },
      (state) => getPath(state, 'loads', 'svgStatus') === 'ready',
    );

    const derived = sourceViews(filename);
    expect(derived).toHaveLength(3);
    expect(derived.map((entry) => String(entry.rawGroup)).sort()).toEqual(expectedGroups);
    expect(new Set(derived.map((entry) => entry.rawGroup)).size).toBe(3);
    for (const view of derived) {
      expect(view.sourceScope).toBe('generic');
      expect(view.sourceLocal).toBeNull();
      expect(getPath(view, 'match', 'status')).toBe('matched');
      expect(getPath(view, 'match', 'selected', 'label')).toBe(action);
      expect(Array.isArray(view.targetScopes)).toBe(true);
      expect(getPath(view, 'trace', 'stableId')).toBe(view.id);
      expect(isRecord(getPath(view, 'trace', 'pricing', 'normal', 'provenance'))).toBe(true);
      expect(Array.isArray(getPath(view, 'trace', 'sources'))).toBe(true);
      expect(view.exportable).toBe(false);
    }

    await executeAndWaitForState(
      api,
      'preflight.run',
      undefined,
      (state) => getPath(state, 'preflight', 'fileCount') === 3,
    );

    const blocked = sourceViews(filename);
    expect(blocked).toHaveLength(3);
    expect(blocked.filter((entry) => entry.exportable === true)).toHaveLength(0);
    for (const view of blocked) {
      expect(getPath(view, 'preflight', 'blocking')).toBe(true);
      expect(containsScalar(getPath(view, 'preflight'), 'pricing.explicit-pair-missing')).toBe(true);
      expect(getPath(view, 'generation')).toBeUndefined();
      expect(getPath(view, 'trace', 'stableId')).toBe(view.id);
      expect(containsScalar(getPath(view, 'trace'), 'pricing.explicit-pair-missing')).toBe(true);
      expect(isRecord(getPath(view, 'trace', 'pricing', 'normal', 'provenance'))).toBe(true);
    }

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    for (const view of blocked) {
      const individual = await api.execute('export.request', { kind: 'file', fileIds: [view.id] });
      expect(individual.ok).toBe(false);
      if (individual.ok === false) expect(individual.error.code).toBe('not-available');
    }
    const batch = await api.execute('export.request', { kind: 'batch' });
    expect(batch.ok).toBe(false);
    if (batch.ok === false) expect(batch.error.code).toBe('not-available');
    expect(click).not.toHaveBeenCalled();
  });
});
