import { describe, it, expect } from 'vitest';
import { SoftBody } from '../bodies/SoftBody';
import { FluidBody } from '../bodies/FluidBody';
import { XPBDSoftSchema } from '../bodies/schemas/XPBDSoftSchema';
import { FEMSchema } from '../bodies/schemas/FEMSchema';
import { SPHSchema } from '../bodies/schemas/SPHSchema';
import { PBFSchema } from '../bodies/schemas/PBFSchema';
import { MPMFluidSchema } from '../bodies/schemas/MPMFluidSchema';

describe('SoftBody authoring — algorithm→schema + pos.w=invMass (T018)', () => {
    it('XPBD usa XPBDSoftSchema e codifica invMass em pos.w', () => {
        const b = new SoftBody({ algorithm: 'XPBD', position: [1, 2, 3], mass: 2 });
        expect(b.getDescriptors()[0]?.schema?.name).toBe('XPBDSoftSchema');
        expect(b.data.pos).toEqual([1, 2, 3, 0.5]);
    });
    it('FEM usa FEMSchema; massa ausente ⇒ partícula fixa (invMass 0)', () => {
        const b = new SoftBody({ algorithm: 'FEM', position: [0, 1, 0] });
        expect(b.getDescriptors()[0]?.schema?.name).toBe('FEMSchema');
        expect(b.data.pos).toEqual([0, 1, 0, 0]);
    });
    it('massa negativa → erro legível', () => {
        expect(() => new SoftBody({ algorithm: 'XPBD', mass: -1 })).toThrow(/massa/);
    });
});

describe('SoftBody authoring — equivalência domínio↔cru (T019 / FR-006)', () => {
    it('mesmo buffer empacotado', () => {
        const domain = new SoftBody({ algorithm: 'XPBD', position: [1, 2, 3], mass: 2 });
        const raw = new SoftBody({ schema: XPBDSoftSchema, data: { pos: [1, 2, 3, 0.5] } });
        expect(XPBDSoftSchema.pack(domain.data)).toEqual(XPBDSoftSchema.pack(raw.data));
    });
});

describe('FluidBody authoring — algorithm→schema (T022)', () => {
    it('SPH/PBF/MPM selecionam o schema correto', () => {
        expect(new FluidBody({ algorithm: 'SPH' }).getDescriptors()[0]?.schema?.name).toBe(
            'SPHSchema',
        );
        expect(new FluidBody({ algorithm: 'PBF' }).getDescriptors()[0]?.schema?.name).toBe(
            'PBFSchema',
        );
        expect(new FluidBody({ algorithm: 'MPM' }).getDescriptors()[0]?.schema?.name).toBe(
            'MPMFluidSchema',
        );
    });
    it('define pos.xyz/vel.xyz mas deixa pos.w (densidade/lambda) em 0', () => {
        const b = new FluidBody({ algorithm: 'SPH', position: [1, 2, 3], velocity: [4, 5, 6] });
        expect(b.data.pos).toEqual([1, 2, 3, 0]);
        expect(b.data.vel).toEqual([4, 5, 6, 0]);
    });
});

describe('FluidBody authoring — equivalência domínio↔cru (T023 / FR-006)', () => {
    it('mesmo buffer empacotado', () => {
        const domain = new FluidBody({ algorithm: 'PBF', position: [1, 2, 3] });
        const raw = new FluidBody({
            schema: PBFSchema,
            data: { pos: [1, 2, 3, 0], vel: [0, 0, 0, 0] },
        });
        expect(PBFSchema.pack(domain.data)).toEqual(PBFSchema.pack(raw.data));
    });
});

// Garante que os schemas referenciados existem (import sanity).
describe('schemas referenciados', () => {
    it('todos definidos', () => {
        for (const s of [XPBDSoftSchema, FEMSchema, SPHSchema, PBFSchema, MPMFluidSchema]) {
            expect(s.name.length).toBeGreaterThan(0);
        }
    });
});
