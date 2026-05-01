import { describe, expect, it, vi } from 'vitest';
import type { EnginePlugin } from '../../presentation/plugins/EnginePlugin';

// Test only the EnginePlugin contract — Application.use é coberto por
// integration smokes (browser-only por requerer device real).

describe('EnginePlugin contract', () => {
    it('plugin tem name e install', () => {
        const p: EnginePlugin = {
            name: 'test',
            install: vi.fn(),
        };
        expect(p.name).toBe('test');
        expect(typeof p.install).toBe('function');
    });

    it('plugin com dispose opcional', () => {
        const installFn = vi.fn();
        const disposeFn = vi.fn();
        const p: EnginePlugin = {
            name: 'with-dispose',
            install: installFn,
            dispose: disposeFn,
        };
        expect(p.dispose).toBeDefined();
    });

    it('plugin sem dispose também é válido', () => {
        const p: EnginePlugin = {
            name: 'no-dispose',
            install: vi.fn(),
        };
        expect(p.dispose).toBeUndefined();
    });
});
