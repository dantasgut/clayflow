import { describe, expect, it } from 'vitest';
import { slot } from '../flows/slots';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';

const S = new StructSchema('SlotsTestSchema', { v: FieldType.vec4f });
class A extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};
    getDescriptors() {
        return [];
    }
    getPipelineDescriptors() {
        return [];
    }
}

describe('slot.*', () => {
    it('declarações imutáveis com padrões (obrigatório)', () => {
        const p = slot.pool('WorldTransform');
        expect(p).toEqual({ kind: 'pool', poolKey: 'WorldTransform', optional: false });
        expect(Object.isFrozen(p)).toBe(true);
        expect(slot.pool('X', { optional: true }).optional).toBe(true);
        expect(slot.bodies()).toEqual({ kind: 'bodies' });
        expect(slot.pools(['A', 'B'])).toEqual({ kind: 'pools', poolKeys: ['A', 'B'] });
        expect(slot.singleton(S)).toEqual({ kind: 'singleton', schema: S, optional: false });
        expect(slot.texture(S, 'depth', { optional: true })).toEqual({
            kind: 'texture',
            schema: S,
            descId: 'depth',
            optional: true,
        });
        expect(slot.entities({ all: [A] })).toEqual({ kind: 'entities', all: [A] });
    });

    it("target: 'canvas', canvas com profundidade, ou textura de um Resource", () => {
        expect(slot.target('canvas')).toEqual({ kind: 'target', color: 'canvas' });
        const depth = { schema: S, descId: 'depth' };
        expect(slot.target({ color: 'canvas', depth })).toEqual({
            kind: 'target',
            color: 'canvas',
            depth,
        });
        const color = { schema: S, descId: 'color' };
        expect(slot.target({ color })).toEqual({ kind: 'target', color });
    });

    it('select acompanha singleton e texture', () => {
        const select = () => true;
        expect(slot.singleton(S, { select }).select).toBe(select);
        expect(slot.texture(S, 'd', { select }).select).toBe(select);
    });
});
