import { describe, expect, it } from 'vitest';
import { ArgsError } from '../args';
import { planRuns } from '../plan';
import { config, syntheticCatalog } from './fixtures';

describe('planRuns', () => {
    it('produto cena × variante × engine × repetição', () => {
        const plan = planRuns(syntheticCatalog, config());
        // boxes: 2 variantes × 2 engines × 5 reps; lights: 1 variante × three × 5 reps
        expect(plan.runs).toHaveLength(20 + 5);
        expect(plan.runs[0]).toEqual({
            scene: 'boxes',
            variant: '10',
            engine: 'clayflow',
            repetition: 0,
            seed: 1,
        });
    });

    it('repetições intercaladas: todas as linhas numa repetição antes da seguinte, na ordem do catálogo', () => {
        // Arrange / Act
        const plan = planRuns(syntheticCatalog, config(['--reps', '3']));
        // Assert: a repetição nunca diminui; as 5 linhas aparecem na mesma ordem em cada repetição.
        const reps = plan.runs.map((r) => r.repetition);
        expect(reps).toEqual([...reps].sort((a, b) => a - b));
        const rows = (k: number): string[] =>
            plan.runs
                .filter((r) => r.repetition === k)
                .map((r) => `${r.scene}/${r.variant}/${r.engine}`);
        expect(rows(0)).toHaveLength(5);
        expect(rows(1)).toEqual(rows(0));
        expect(rows(2)).toEqual(rows(0));
        expect(rows(0)[0]).toBe('boxes/10/clayflow');
    });

    it('não suportado vira um único Result sem abrir página', () => {
        const plan = planRuns(syntheticCatalog, config());
        expect(plan.unsupported).toEqual([
            {
                scene: 'lights',
                variant: '8',
                engine: 'clayflow',
                status: 'unsupported',
                reason: 'sem luzes pontuais',
                until: 'F4',
            },
        ]);
        expect(plan.runs.some((r) => r.scene === 'lights' && r.engine === 'clayflow')).toBe(false);
    });

    it('respeita filtros de cena, variante e engine', () => {
        const plan = planRuns(
            syntheticCatalog,
            config(['--scene', 'boxes', '--variant', '20', '--engine', 'clayflow', '--reps', '1']),
        );
        expect(plan.runs).toEqual([
            { scene: 'boxes', variant: '20', engine: 'clayflow', repetition: 0, seed: 1 },
        ]);
        expect(plan.unsupported).toEqual([]);
    });

    it('filtro sem correspondência lista os ids válidos', () => {
        expect(() => planRuns(syntheticCatalog, config(['--scene', 'nope']))).toThrow(ArgsError);
        expect(() => planRuns(syntheticCatalog, config(['--scene', 'nope']))).toThrow(
            /boxes, lights/,
        );
        expect(() => planRuns(syntheticCatalog, config(['--variant', '99']))).toThrow(/10, 20, 8/);
    });
});
