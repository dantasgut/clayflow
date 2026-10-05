import { describe, expect, it } from 'vitest';
import { ArgsError } from '../args';
import { planRuns } from '../plan';
import { config, syntheticCatalog } from './fixtures';

describe('planRuns', () => {
    it('produto cena × variante × engine × repetição', () => {
        const plan = planRuns(syntheticCatalog, config());
        // boxes: 2 variantes × 2 engines × 3 reps; lights: 1 variante × three × 3 reps
        expect(plan.runs).toHaveLength(12 + 3);
        expect(plan.runs[0]).toEqual({
            scene: 'boxes',
            variant: '10',
            engine: 'clayflow',
            repetition: 0,
            seed: 1,
        });
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
