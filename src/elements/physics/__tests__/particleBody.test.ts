/**
 * Corpos de partículas (spec 008, US2): um Resource com N partículas por campo, schema pelo algoritmo, padrões por
 * partícula iguais aos de antes (uma entidade por partícula), validação dos arrays e arestas internas do XPBD.
 */
import { describe, it, expect } from 'vitest';
import { SoftBody } from '../bodies/SoftBody';
import { FluidBody } from '../bodies/FluidBody';
import { XPBDSoftSchema } from '../bodies/schemas/XPBDSoftSchema';
import { PBFSchema } from '../bodies/schemas/PBFSchema';
import { MPMSoftSchema } from '../bodies/schemas/MPMSoftSchema';
import { DistanceConstraint } from '../constraints/DistanceConstraint';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { FieldType } from '../../../scene/descriptors/FieldType';

const list = (v: ArrayLike<number> | undefined): number[] => Array.from(v ?? []);

describe('SoftBody — contêiner de partículas', () => {
    it('XPBD: N do tamanho de position, inv_mass por partícula em pos.w, pred = pos', () => {
        const b = new SoftBody({ algorithm: 'XPBD', position: [1, 2, 3, 4, 5, 6], mass: [2, 0] });
        expect(b.count).toBe(2);
        const desc = b.getDescriptors()[0]!;
        expect(desc.schema).toBe(XPBDSoftSchema);
        expect(desc.count).toBe(2);
        expect(desc.upload).toBe('initial');
        expect(list(b.data.body.pos)).toEqual([1, 2, 3, 0.5, 4, 5, 6, 0]);
        expect(list(b.data.body.pred)).toEqual([1, 2, 3, 0, 4, 5, 6, 0]);
    });

    it('massa única para todas; ausente ⇒ fixas', () => {
        const b = new SoftBody({ algorithm: 'FEM', position: [0, 1, 0, 0, 2, 0], mass: 4 });
        expect(list(b.data.body.pos)).toEqual([0, 1, 0, 0.25, 0, 2, 0, 0.25]);
        expect(list(new SoftBody({ algorithm: 'FEM', position: [0, 0, 0] }).data.body.pos)[3]).toBe(
            0,
        );
    });

    it('MPM: F = I por partícula, massa do material (pos.w = 0)', () => {
        const b = new SoftBody({ algorithm: 'MPM', position: [1, 2, 3, 4, 5, 6], mass: 5 });
        expect(b.getDescriptors()[0]!.schema).toBe(MPMSoftSchema);
        expect(list(b.data.body.pos)).toEqual([1, 2, 3, 0, 4, 5, 6, 0]);
        expect(list(b.data.body.F_col1)).toEqual([0, 1, 0, 0, 0, 1, 0, 0]);
    });

    it('arrays inconsistentes, N = 0 e massa negativa: erros com o campo e os tamanhos', () => {
        expect(() => new SoftBody({ algorithm: 'XPBD', position: [] })).toThrow(
            /position tem 0 valores/,
        );
        expect(() => new SoftBody({ algorithm: 'XPBD', position: [0, 0] })).toThrow(
            /3 \(x, y, z\)/,
        );
        expect(
            () => new SoftBody({ algorithm: 'XPBD', position: [0, 0, 0, 1, 1, 1], mass: [1] }),
        ).toThrow(/mass tem 1 valores; com 2 partículas são 2/);
        expect(() => new SoftBody({ algorithm: 'XPBD', position: [0, 0, 0], mass: -1 })).toThrow(
            /massa/,
        );
    });

    it('edges: arestas internas no pool de restrições, com slotRefs na faixa do corpo', () => {
        const b = new SoftBody({
            algorithm: 'XPBD',
            position: [0, 0, 0, 3, 4, 0, 6, 8, 0],
            mass: 1,
            edges: { a: [0, 1], b: [1, 2], compliance: 1e-6 },
        });
        const edges = b.getDescriptors()[1]!;
        expect(edges.schema).toBe(DistanceConstraint.schema);
        expect(edges.count).toBe(2);
        expect(edges.slotRefs).toEqual({ i: 'self:body', j: 'self:body' });
        expect(list(b.data.edges?.rest_length)).toEqual([5, 5]);
        expect(list(b.data.edges?.compliance).map((c) => Math.fround(1e-6) === c)).toEqual([
            true,
            true,
        ]);
    });

    it('edges: índice fora do corpo e algoritmo sem restrições são erro', () => {
        expect(
            () =>
                new SoftBody({
                    algorithm: 'XPBD',
                    position: [0, 0, 0, 1, 0, 0],
                    edges: { a: [0], b: [2] },
                }),
        ).toThrow(/edges.b\[0\] = 2 fora das 2 partículas/);
        expect(
            () =>
                new SoftBody({
                    algorithm: 'FEM',
                    position: [0, 0, 0, 1, 0, 0],
                    edges: { a: [0], b: [1] },
                }),
        ).toThrow(/edges.*XPBD/);
    });
});

describe('FluidBody — contêiner de partículas', () => {
    it('SPH/PBF/MPM selecionam o schema; pos.w/vel.w em 0', () => {
        for (const [algorithm, name] of [
            ['SPH', 'SPHSchema'],
            ['PBF', 'PBFSchema'],
            ['MPM', 'MPMFluidSchema'],
        ] as const) {
            expect(
                new FluidBody({ algorithm, position: [0, 0, 0] }).getDescriptors()[0]!.schema!.name,
            ).toBe(name);
        }
        const b = new FluidBody({ algorithm: 'SPH', position: [1, 2, 3], velocity: [4, 5, 6] });
        expect(list(b.data.body.pos)).toEqual([1, 2, 3, 0]);
        expect(list(b.data.body.vel)).toEqual([4, 5, 6, 0]);
        expect(b.data.body.F_col0).toBeUndefined();
        expect(
            list(new FluidBody({ algorithm: 'MPM', position: [0, 1, 0] }).data.body.F_col2),
        ).toEqual([0, 0, 1, 0]);
    });

    it('domínio e cru empacotam os mesmos bytes', () => {
        const domain = new FluidBody({ algorithm: 'PBF', position: [1, 2, 3, 4, 5, 6] });
        const raw = new FluidBody({
            schema: PBFSchema,
            count: 2,
            data: { pos: [1, 2, 3, 0, 4, 5, 6, 0] },
        });
        expect(PBFSchema.packRange(domain.data.body, 0, 2)).toEqual(
            PBFSchema.packRange(raw.data.body, 0, 2),
        );
    });

    it('velocity com tamanho errado e schema sem pos: vec4f são erro', () => {
        expect(
            () => new FluidBody({ algorithm: 'SPH', position: [0, 0, 0], velocity: [1] }),
        ).toThrow(/velocity/);
        const bare = new StructSchema('NoPos', { x: FieldType.vec4f });
        expect(() => new FluidBody({ schema: bare, count: 1 })).toThrow(/pos: vec4f/);
    });
});

describe('DistanceConstraint — entre corpos', () => {
    it('{ body, index } com slotRefs ref:body; pools diferentes é erro', () => {
        const a = new SoftBody({ algorithm: 'XPBD', position: [0, 0, 0] });
        const b = new SoftBody({ algorithm: 'XPBD', position: [1, 0, 0] });
        const c = new DistanceConstraint({
            a: { body: a, index: 0 },
            b: { body: b, index: 0 },
            restLength: 1,
        });
        expect(c.getDescriptors()[0]!.slotRefs).toEqual({ i: 'ref:body', j: 'ref:body' });
        const fluid = new FluidBody({ algorithm: 'SPH', position: [0, 0, 0] });
        expect(
            () =>
                new DistanceConstraint({ a: { body: a, index: 0 }, b: { body: fluid, index: 0 } }),
        ).toThrow(/pools diferentes/);
    });
});
