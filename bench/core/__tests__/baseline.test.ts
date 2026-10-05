import { describe, expect, it } from 'vitest';
import { BaselineError, baselinePath, parseBaseline, parseRunFile, toBaseline } from '../baseline';
import { okResult, runFile } from './fixtures';

describe('baseline', () => {
    const run = runFile([
        okResult('instances', '10k', 'clayflow'),
        okResult('instances', '10k', 'three'),
    ]);

    it('guarda só resultados do clayflow, com perfil, commit e tolerância', () => {
        const b = toBaseline(run, 0.1, new Date('2026-10-05T00:00:00Z'));
        expect(b.results.map((r) => r.engine)).toEqual(['clayflow']);
        expect(b).toMatchObject({
            schemaVersion: 1,
            profileId: run.profile.profileId,
            commit: 'abc1234',
            tolerance: 0.1,
            createdAt: '2026-10-05T00:00:00.000Z',
        });
    });

    it('ida e volta por JSON', () => {
        const b = toBaseline(run, 0.1);
        expect(parseBaseline(JSON.stringify(b))).toEqual(b);
        expect(parseRunFile(JSON.stringify(run))).toEqual(run);
    });

    it('erros legíveis', () => {
        expect(() => parseBaseline('{')).toThrow(BaselineError);
        expect(() => parseBaseline('null')).toThrow(/inválido/);
        expect(() => parseBaseline('{"schemaVersion":2}')).toThrow(/schemaVersion/);
        expect(() => parseBaseline('{"schemaVersion":1}')).toThrow(/profileId/);
        expect(() => parseRunFile('{"schemaVersion":1}')).toThrow(BaselineError);
    });

    it('caminho por perfil', () => {
        expect(baselinePath('p-1')).toBe('bench/baselines/p-1.json');
    });
});
