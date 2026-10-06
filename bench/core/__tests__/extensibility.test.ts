/**
 * SC-004: uma cena nova entra no harness só pela própria definição — nenhum módulo do
 * executor, das métricas, do relatório ou do baseline muda.
 */
import { describe, expect, it } from 'vitest';
import { toBaseline } from '../baseline';
import { validateCatalog } from '../catalog';
import { compare } from '../compare';
import { planRuns } from '../plan';
import { toMarkdown } from '../report';
import type { Result, SceneDefinition } from '../types';
import { config, okResult, runFile } from './fixtures';

const terrain: SceneDefinition = {
    id: 'terrain-vegetation',
    title: 'Terreno e vegetação',
    description: 'cena fictícia de uma fase futura (F5)',
    phase: 'F5',
    seed: 7,
    camera: { position: [0, 50, 80], target: [0, 0, 0], fovDeg: 60 },
    variants: [{ id: '1km2', params: { size: 1000 } }],
    implementations: {
        clayflow: () => Promise.resolve({ setup: () => undefined }),
        three: { unsupported: 'sem terreno paramétrico equivalente', until: 'nunca' },
    },
};

describe('extensibilidade (SC-004)', () => {
    it('cena definida só no teste atravessa validação, plano, relatório, baseline e gate', () => {
        const catalog = validateCatalog([terrain]);
        const plan = planRuns(catalog, config(['--reps', '2']));
        expect(plan.runs).toHaveLength(2);
        expect(plan.runs.every((r) => r.engine === 'clayflow')).toBe(true);
        expect(plan.unsupported).toEqual([
            {
                scene: 'terrain-vegetation',
                variant: '1km2',
                engine: 'three',
                status: 'unsupported',
                reason: 'sem terreno paramétrico equivalente',
                until: 'nunca',
            },
        ]);

        const results: Result[] = [
            okResult('terrain-vegetation', '1km2', 'clayflow'),
            ...plan.unsupported,
        ];
        const run = runFile(results);
        const md = toMarkdown(run);
        expect(md).toContain('| terrain-vegetation | 1km2 |');
        expect(md).toContain('não suportado (até nunca)');

        const baseline = toBaseline(run, 0.1);
        expect(baseline.results).toHaveLength(1);
        expect(compare(baseline, run, 0.1).passed).toBe(true);
    });
});
