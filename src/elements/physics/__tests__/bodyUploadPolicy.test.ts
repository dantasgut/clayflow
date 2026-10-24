import { describe, expect, it } from 'vitest';
import { RigidBody } from '../bodies/RigidBody';
import { SoftBody } from '../bodies/SoftBody';
import { FluidBody } from '../bodies/FluidBody';
import { BoxCollider } from '../colliders/BoxCollider';
import { SphereCollider } from '../colliders/SphereCollider';
import { DistanceConstraint } from '../constraints/DistanceConstraint';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';

function pooled(descs: readonly GPUDescriptor[]): GPUDescriptor[] {
    return descs.filter((d) => d.storage === 'pool');
}

describe('política de envio dos corpos simulados', () => {
    it.each([
        ['RigidBody esfera', () => new RigidBody({ shape: 'sphere', radius: 0.5, mass: 1 })],
        ['RigidBody caixa', () => new RigidBody({ shape: 'box', halfExtents: [1, 1, 1], mass: 0 })],
        ['SoftBody XPBD', () => new SoftBody({ algorithm: 'XPBD', position: [0, 0, 0], mass: 1 })],
        ['SoftBody FEM', () => new SoftBody({ algorithm: 'FEM', position: [0, 0, 0], mass: 1 })],
        ['FluidBody SPH', () => new FluidBody({ algorithm: 'SPH', position: [0, 0, 0] })],
        ['FluidBody PBF', () => new FluidBody({ algorithm: 'PBF', position: [0, 0, 0] })],
        ['FluidBody MPM', () => new FluidBody({ algorithm: 'MPM', position: [0, 0, 0] })],
    ])("%s declara upload 'initial' no pool do corpo", (_name, make) => {
        // A série da energia (spec 037) e as somas dos blocos dela são produzidas pela GPU: fora desta política
        // (conferidas abaixo).
        const descs = pooled(make().getDescriptors()).filter(
            (d) => d.history === undefined && d.id !== 'partials',
        );
        expect(descs.length).toBeGreaterThan(0);
        for (const d of descs) expect(d.upload).toBe('initial');
    });

    it("RigidBody: a série da energia (canal temporal, spec 037) é da GPU — 'never', sob demanda, 8 fatias", () => {
        const energy = new RigidBody({ shape: 'sphere', radius: 0.5, mass: 1 })
            .getDescriptors()
            .find((d) => d.id === 'energy');
        expect(energy).toMatchObject({
            storage: 'pool',
            upload: 'never',
            allocation: 'onDemand',
            history: { depth: 8 },
        });
    });

    it("SoftBody: a série da energia e as somas dos blocos são da GPU — 'never', sob demanda", () => {
        const descs = new SoftBody({
            algorithm: 'XPBD',
            position: [0, 0, 0],
            mass: 1,
        }).getDescriptors();
        expect(descs.find((d) => d.id === 'energy')).toMatchObject({
            upload: 'never',
            allocation: 'onDemand',
            history: { depth: 8 },
        });
        expect(descs.find((d) => d.id === 'partials')).toMatchObject({
            upload: 'never',
            allocation: 'onDemand',
        });
    });

    it('colisores e restrições continuam com o envio padrão (CPU é dona)', () => {
        const body = new SoftBody({ algorithm: 'XPBD', position: [0, 0, 0, 1, 0, 0], mass: 1 });
        const items = [
            new BoxCollider({ halfExtents: [1, 1, 1, 0] }),
            new SphereCollider({ radius: 1 }),
            new DistanceConstraint({ a: { body, index: 0 }, b: { body, index: 1 } }),
        ];
        for (const item of items) {
            for (const d of pooled(item.getDescriptors())) expect(d.upload).toBeUndefined();
        }
    });
});
