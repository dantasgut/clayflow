import { describe, expect, it } from 'vitest';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import { StructSchema } from '../descriptors/StructSchema';
import { FieldType } from '../descriptors/FieldType';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { ReuseError, World } from '../world/World';

class Part extends Entity implements Resource {
    static readonly schema = new StructSchema('ReusePart', { v: FieldType.f32 });
    state = ResourceState.Uninitialized;
    data: Record<string, unknown> = { v: 0 };
    getDescriptors() {
        return [];
    }
    getPipelineDescriptors() {
        return [];
    }
}

class Group extends Entity {}

const world = () => new World(new DefaultEventBus());

describe('World — reuso de instância proibido (R11)', () => {
    it('inserir a mesma raiz duas vezes lança ReuseError com "crie outra instância"', () => {
        const w = world();
        const root = new Part();
        w.insert(root);
        expect(() => w.insert(root)).toThrow(ReuseError);
        expect(() => w.insert(root)).toThrow(/instância já inserida — crie outra instância/);
    });

    it('mesmo recurso em duas raízes lança', () => {
        const w = world();
        const shared = new Part();
        w.insert(new Group().add(shared));
        expect(() => w.insert(new Group().add(shared))).toThrow(
            /ReusePart.*já está em outra entidade/,
        );
    });

    it('mesmo recurso duas vezes na mesma árvore lança, sem inserir nada', () => {
        const w = world();
        const p = new Part();
        expect(() => w.insert(new Group().add(p).add(p))).toThrow(/aparece duas vezes/);
        expect(w.queryBySchemaName('ReusePart')).toHaveLength(0);
        expect(() => w.insert(p)).not.toThrow();
    });

    it('recurso vivo em outro World lança; os mapas recurso → entidade não são compartilhados', () => {
        const a = world();
        const b = world();
        const p = new Part();
        a.insert(p);
        expect(b.entityIdOfResource(p)).toBeUndefined();
        expect(() => b.insert(p)).toThrow(/em outra cena/);
    });

    it('remove seguido de insert da mesma raiz funciona; entityIdOfResource limpo após remove', () => {
        const w = world();
        const child = new Part();
        const root = new Group().add(child);
        const first = w.insert(root);
        expect(w.entityIdOfResource(child)).toBe(first);
        w.remove(root);
        expect(w.entityIdOfResource(child)).toBeUndefined();
        const second = w.insert(root);
        expect(second).not.toBe(first);
        expect(w.entityIdOfResource(child)).toBe(second);
    });

    it('depois de remover de um World, a instância pode ir para outro', () => {
        const a = world();
        const b = world();
        const p = new Part();
        a.insert(p);
        a.remove(p);
        expect(() => b.insert(p)).not.toThrow();
    });
});
