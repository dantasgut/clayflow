import { describe, expect, it } from 'vitest';
import { ResourceState } from '../contracts/ResourceState';
import { ResourceStateHandlerRegistry } from '../lifecycle/ResourceStateHandlerRegistry';

describe('ResourceStateHandlerRegistry', () => {
    const reg = new ResourceStateHandlerRegistry();

    it('todos os 7 estados têm handler', () => {
        for (const s of Object.values(ResourceState)) {
            expect(reg.get(s)).toBeDefined();
        }
    });

    it('Uninitialized → Loading é válida', () => {
        expect(reg.canTransition(ResourceState.Uninitialized, ResourceState.Loading)).toBe(true);
    });

    it('Uninitialized → Ready é inválida (deve passar por Loading)', () => {
        expect(reg.canTransition(ResourceState.Uninitialized, ResourceState.Ready)).toBe(false);
    });

    it('Ready → Dirty/GpuManaged/Disposed válidas', () => {
        expect(reg.canTransition(ResourceState.Ready, ResourceState.Dirty)).toBe(true);
        expect(reg.canTransition(ResourceState.Ready, ResourceState.GpuManaged)).toBe(true);
        expect(reg.canTransition(ResourceState.Ready, ResourceState.Disposed)).toBe(true);
    });

    it('Destroyed terminal — sem transições válidas', () => {
        expect(reg.get(ResourceState.Destroyed).validTransitions()).toHaveLength(0);
    });

    it('canRender: somente Ready e GpuManaged', () => {
        expect(reg.get(ResourceState.Ready).canRender()).toBe(true);
        expect(reg.get(ResourceState.GpuManaged).canRender()).toBe(true);
        expect(reg.get(ResourceState.Uninitialized).canRender()).toBe(false);
        expect(reg.get(ResourceState.Loading).canRender()).toBe(false);
        expect(reg.get(ResourceState.Dirty).canRender()).toBe(false);
        expect(reg.get(ResourceState.Disposed).canRender()).toBe(false);
        expect(reg.get(ResourceState.Destroyed).canRender()).toBe(false);
    });

    it('Disposed → Destroyed única transição válida', () => {
        const valid = reg.get(ResourceState.Disposed).validTransitions();
        expect(valid).toEqual([ResourceState.Destroyed]);
    });

    it('GpuManaged.suppressCpuUpload é true', () => {
        expect(reg.get(ResourceState.GpuManaged).suppressCpuUpload()).toBe(true);
        expect(reg.get(ResourceState.Ready).suppressCpuUpload()).toBe(false);
    });

    it('Dirty.needsUpdate é true', () => {
        expect(reg.get(ResourceState.Dirty).needsUpdate()).toBe(true);
        expect(reg.get(ResourceState.Ready).needsUpdate()).toBe(false);
    });

    // Cobertura completa por handler — invoca cada método de cada estado uma vez.
    const all: readonly ResourceState[] = [
        ResourceState.Uninitialized,
        ResourceState.Loading,
        ResourceState.Ready,
        ResourceState.Dirty,
        ResourceState.GpuManaged,
        ResourceState.Disposed,
        ResourceState.Destroyed,
    ];
    for (const s of all) {
        it(`handler ${s} expõe todos os métodos`, () => {
            const h = reg.get(s);
            expect(typeof h.canRender()).toBe('boolean');
            expect(typeof h.needsAllocation()).toBe('boolean');
            expect(typeof h.needsUpdate()).toBe('boolean');
            expect(typeof h.needsDisposal()).toBe('boolean');
            expect(typeof h.suppressCpuUpload()).toBe('boolean');
            expect(typeof h.ignoreDirtyMark()).toBe('boolean');
            expect(Array.isArray(h.validTransitions())).toBe(true);
            expect(h.stateId).toBe(s);
        });
    }
});
