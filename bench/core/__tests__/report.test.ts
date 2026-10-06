import { describe, expect, it } from 'vitest';
import { regressionToMarkdown, toMarkdown, verdict } from '../report';
import type { Result } from '../types';
import { okResult, runFile } from './fixtures';

const results: Result[] = [
    {
        ...okResult('instances', '10k', 'clayflow', {
            cpuMs: 4.1,
            gpuMs: 2,
            frameMs: { mean: 10, p95: 11, p99: 12 },
        }),
        limitations: ['sem instancing no render: 1 draw e 4 bind groups por objeto (até F2)'],
    },
    okResult('instances', '10k', 'three', {
        cpuMs: 0.41,
        gpuMs: null,
        frameMs: { mean: 5, p95: 6, p99: 7 },
        memoryKind: 'estimated',
    }),
    {
        scene: 'point-lights',
        variant: '256',
        engine: 'clayflow',
        status: 'unsupported',
        reason: 'o forward ignora PointLight',
        until: 'F4',
    },
    okResult('point-lights', '256', 'three'),
    {
        scene: 'rigid-bodies',
        variant: '10k',
        engine: 'clayflow',
        status: 'timeout',
        reason: 'excedeu 60000 ms',
    },
    {
        ...okResult('rigid-bodies', '10k', 'three', { fps: 60, vsyncLimited: true }),
        unstable: true,
    },
];

describe('toMarkdown', () => {
    const md = toMarkdown(runFile(results));

    it('cabeçalho com o perfil', () => {
        expect(md).toContain('Apple M2');
        expect(md).toContain('chrome 141.0.1');
        expect(md).toContain('abc1234');
        expect(md).toContain('`apple-m2-chrome141-macos-1280x720-abc123`');
    });

    it('colunas clay / three / × e n/d para GPU indisponível (nunca 0)', () => {
        expect(md).toContain('| instances | 10k | 4.10 / 0.41 / 10.00× | 2.00 / n/d / — |');
        expect(md).not.toMatch(/GPU[^|]*\| 0\.00/);
    });

    it('memória estimada marcada com *', () => {
        expect(md).toMatch(/10\.0 \/ 10\.0\\\*/);
    });

    it('estados não suportado / tempo esgotado com motivo e instabilidade', () => {
        expect(md).toContain('não suportado (até F4)');
        expect(md).toContain('tempo esgotado');
        expect(md).toContain('excedeu 60000 ms');
        expect(md).toContain('⚠');
        expect(md).toContain('limitado pela vsync');
    });

    it('resumo por cena e seção de limitações', () => {
        expect(md).toContain('**instances / 10k**: clayflow mais lento (2.00×)');
        expect(md).toContain('## Limitações conhecidas do motor');
        expect(md).toContain('sem instancing no render');
    });
});

describe('verdict', () => {
    it('mais rápido / equivalente / mais lento', () => {
        const a = okResult('s', 'v', 'clayflow', { frameMs: { mean: 5, p95: 0, p99: 0 } });
        const b = okResult('s', 'v', 'three', { frameMs: { mean: 10, p95: 0, p99: 0 } });
        const c = okResult('s', 'v', 'three', { frameMs: { mean: 5.2, p95: 0, p99: 0 } });
        expect(verdict(a, b)).toBe('clayflow mais rápido (2.00×)');
        expect(verdict(a, c)).toBe('equivalente (±10%)');
        expect(verdict(b, a)).toBe('clayflow mais lento (2.00×)');
        expect(verdict(undefined, b)).toContain('sem comparação');
    });
});

describe('regressionToMarkdown', () => {
    it('lista regressões e sugere atualizar baseline quando há melhorias', () => {
        const md = regressionToMarkdown({
            profileId: 'p',
            baselineCommit: 'abc',
            tolerance: 0.1,
            passed: false,
            regressions: [
                {
                    scene: 'instances',
                    variant: '10k',
                    metric: 'cpuMs',
                    baseline: 4,
                    current: 4.6,
                    deltaPct: 15,
                },
            ],
            improvements: [
                {
                    scene: 'instances',
                    variant: '100k',
                    metric: 'gpuMs',
                    baseline: 10,
                    current: 8,
                    deltaPct: -20,
                },
            ],
            skipped: [
                {
                    scene: 'x',
                    variant: 'y',
                    metric: 'gpuMs',
                    baseline: 'n/d',
                    current: 1,
                    deltaPct: null,
                    note: 'indisponível no baseline',
                },
            ],
        });
        expect(md).toContain('REPROVADO');
        expect(md).toContain('| instances | 10k | cpuMs | 4.00 | 4.60 | +15.0% |');
        expect(md).toContain('-20.0%');
        expect(md).toContain('npm run bench:baseline');
        expect(md).toContain('indisponível no baseline');
    });

    it('sem regressões', () => {
        const md = regressionToMarkdown({
            profileId: 'p',
            baselineCommit: 'abc',
            tolerance: 0.1,
            passed: true,
            regressions: [],
            improvements: [],
            skipped: [],
        });
        expect(md).toContain('PASSOU');
        expect(md).toContain('Nenhuma regressão');
    });
});

describe('formatação de FPS', () => {
    it('abaixo de 10 FPS usa uma casa decimal', () => {
        const md = toMarkdown(runFile([okResult('slow', 'x', 'clayflow', { fps: 0.34 })]));
        expect(md).toContain('| 0.3 / — |');
    });
});

describe('custo efetivo', () => {
    it('usa o maior entre intervalo, CPU e GPU', () => {
        const fast = okResult('s', 'v', 'three', {
            frameMs: { mean: 0.1, p95: 0, p99: 0 },
            cpuMs: 0.05,
            gpuMs: 0.5,
        });
        const slow = okResult('s', 'v', 'clayflow', {
            frameMs: { mean: 1, p95: 0, p99: 0 },
            cpuMs: 0.5,
            gpuMs: null,
        });
        expect(verdict(slow, fast)).toBe('clayflow mais lento (2.00×)');
    });
});
