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
        ['SoftBody XPBD', () => new SoftBody({ algorithm: 'XPBD', mass: 1 })],
        ['SoftBody FEM', () => new SoftBody({ algorithm: 'FEM', mass: 1 })],
        ['FluidBody SPH', () => new FluidBody({ algorithm: 'SPH' })],
        ['FluidBody PBF', () => new FluidBody({ algorithm: 'PBF' })],
        ['FluidBody MPM', () => new FluidBody({ algorithm: 'MPM' })],
    ])("%s declara upload 'initial' no pool do corpo", (_name, make) => {
        const descs = pooled(make().getDescriptors());
        expect(descs.length).toBeGreaterThan(0);
        for (const d of descs) expect(d.upload).toBe('initial');
    });

    it('colisores e restrições continuam com o envio padrão (CPU é dona)', () => {
        const items = [
            new BoxCollider({ halfExtents: [1, 1, 1, 0] }),
            new SphereCollider({ radius: 1 }),
            new DistanceConstraint({}),
        ];
        for (const item of items) {
            for (const d of pooled(item.getDescriptors())) expect(d.upload).toBeUndefined();
        }
    });
});
