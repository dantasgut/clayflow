import { describe, expect, it, vi } from 'vitest';
import { GpuEngineCore } from '../GpuEngineCore';
import type { UncapturedErrorInfo } from '../../contracts/EngineCore';

/** Expõe `handleUncapturedError` (o caminho pelo evento `uncapturederror` do device requer o smoke). */
class TestableCore extends GpuEngineCore {
    trigger(info: UncapturedErrorInfo): void {
        this.handleUncapturedError(info);
    }
}

describe('GpuEngineCore.onUncapturedError', () => {
    it('cada handler registrado recebe o erro sem escopo', () => {
        const core = new TestableCore();
        const a = vi.fn();
        const b = vi.fn();
        core.onUncapturedError(a);
        core.onUncapturedError(b);
        const info: UncapturedErrorInfo = {
            filter: 'validation',
            message: 'Invalid CommandBuffer',
        };
        core.trigger(info);
        expect(a).toHaveBeenCalledWith(info);
        expect(b).toHaveBeenCalledWith(info);
    });

    it('o unsubscribe retira o handler', () => {
        const core = new TestableCore();
        const handler = vi.fn();
        const off = core.onUncapturedError(handler);
        off();
        core.trigger({ filter: 'validation', message: 'x' });
        expect(handler).not.toHaveBeenCalled();
    });
});
