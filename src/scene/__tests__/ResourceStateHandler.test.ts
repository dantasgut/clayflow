import { describe, expect, it } from 'vitest';
import { ResourceState } from '../contracts/ResourceState';
import { ResourceStateHandlerRegistry } from '../lifecycle/ResourceStateHandlerRegistry';

describe('ResourceStateHandlerRegistry', () => {
    const reg = new ResourceStateHandlerRegistry();

    it('todos os 7 estados têm handler', () => {
        for (const s of Object.values(ResourceState)) {
            expect(reg.get(s as ResourceState)).toBeDefined();
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
});
