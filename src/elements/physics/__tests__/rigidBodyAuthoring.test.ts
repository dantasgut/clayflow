import { describe, it, expect } from 'vitest';
import { RigidBody, invMassOf, packMatProps, packBodyShape, inertiaInv } from '../bodies/RigidBody';
import { LCPSchema } from '../bodies/schemas/LCPSchema';

describe('RigidBody authoring — invMass (T007)', () => {
    it('mass > 0 → 1/mass', () => {
        expect(invMassOf(2)).toBeCloseTo(0.5);
        expect(invMassOf(1)).toBeCloseTo(1);
    });
    it('mass ausente ou 0 → 0 (cinemático)', () => {
        expect(invMassOf(undefined)).toBe(0);
        expect(invMassOf(0)).toBe(0);
    });
});

describe('RigidBody authoring — matProps ordem canônica (T008)', () => {
    it('mapeia para [restitution, friction, linDamp, angDamp]', () => {
        expect(
            packMatProps({
                restitution: 0.45,
                friction: 0.3,
                linearDamping: 0.05,
                angularDamping: 0.1,
            }),
        ).toEqual([0.45, 0.3, 0.05, 0.1]);
    });
    it('aplica defaults (0.2 / 0.5 / 0.05 / 0.05)', () => {
        expect(packMatProps({})).toEqual([0.2, 0.5, 0.05, 0.05]);
    });
});

describe('RigidBody authoring — body_shape (T009)', () => {
    it('sphere → [0, r, r, r]', () => {
        expect(packBodyShape({ shape: 'sphere', radius: 0.4 })).toEqual([0, 0.4, 0.4, 0.4]);
    });
    it('box → [1, hx, hy, hz]', () => {
        expect(packBodyShape({ shape: 'box', halfExtents: [0.1, 0.2, 0.3] })).toEqual([
            1, 0.1, 0.2, 0.3,
        ]);
    });
});

describe('RigidBody authoring — inertiaInv (T010)', () => {
    it('esfera sólida: I = 2/5·m·r² ⇒ I_inv = 5/(2·m·r²)', () => {
        const m = 2,
            r = 0.5;
        const expected = 1 / ((2 / 5) * m * r * r);
        const inv = inertiaInv(m, { shape: 'sphere', radius: r });
        expect(inv[0]).toBeCloseTo(expected);
        expect(inv[1]).toBeCloseTo(expected);
        expect(inv[2]).toBeCloseTo(expected);
        expect(inv[3]).toBe(0);
    });
    it('caixa: Ix = 1/3·m·(hy²+hz²)', () => {
        const m = 3;
        const inv = inertiaInv(m, { shape: 'box', halfExtents: [0.1, 0.2, 0.3] });
        expect(inv[0]).toBeCloseTo(1 / ((1 / 3) * m * (0.2 * 0.2 + 0.3 * 0.3)));
    });
    it('cinemático (mass 0/undefined) ⇒ [0,0,0,0]', () => {
        expect(inertiaInv(0, { shape: 'sphere', radius: 1 })).toEqual([0, 0, 0, 0]);
        expect(inertiaInv(undefined, { shape: 'box', halfExtents: [1, 1, 1] })).toEqual([
            0, 0, 0, 0,
        ]);
    });
});

describe('RigidBody authoring — equivalência domínio↔cru (T011 / FR-006)', () => {
    it('construtor de domínio produz o mesmo data que a forma crua equivalente', () => {
        const domain = new RigidBody({
            shape: 'sphere',
            position: [-0.4, 4, 0],
            mass: 1,
            radius: 0.4,
            friction: 0.3,
            restitution: 0.45,
        });
        const raw = new RigidBody({
            schema: LCPSchema,
            data: {
                pos: [-0.4, 4, 0, 1],
                rot: [0, 0, 0, 1],
                rot_pred: [0, 0, 0, 1],
                I_inv: inertiaInv(1, { shape: 'sphere', radius: 0.4 }),
                mat_props: [0.45, 0.3, 0.05, 0.05],
                body_shape: [0, 0.4, 0.4, 0.4],
            },
        });
        // Mesmo buffer empacotado ⇒ mesmo Resource (sem regressão de pool).
        expect(LCPSchema.pack(domain.data)).toEqual(LCPSchema.pack(raw.data));
    });

    it('a forma crua continua funcionando (retrocompat)', () => {
        const raw = new RigidBody({ schema: LCPSchema, data: { pos: [0, 0, 0, 0] } });
        expect((raw.data.pos as number[])[3]).toBe(0);
    });
});

describe('RigidBody authoring — validação de domínio (T012 / FR-007)', () => {
    it('massa negativa → erro legível', () => {
        expect(() => new RigidBody({ shape: 'sphere', radius: 1, mass: -1 })).toThrow(/massa/);
    });
    it('radius ≤ 0 → erro', () => {
        expect(() => new RigidBody({ shape: 'sphere', radius: 0 })).toThrow(/radius/);
    });
    it('halfExtents ≤ 0 → erro', () => {
        expect(() => new RigidBody({ shape: 'box', halfExtents: [1, 0, 1] })).toThrow(
            /halfExtents/,
        );
    });
});

describe('RigidBody authoring — composição (colisor + transform auto)', () => {
    it('esfera dinâmica anexa SphereCollider e Transform com a mesma posição', () => {
        const body = new RigidBody({ shape: 'sphere', radius: 0.4, mass: 1, position: [1, 2, 3] });
        const kinds = body.attached.map((c) => c.constructor.name);
        expect(kinds).toContain('SphereCollider');
        expect(kinds).toContain('Transform');
        expect((body.data.pos as number[]).slice(0, 3)).toEqual([1, 2, 3]);
    });
});
