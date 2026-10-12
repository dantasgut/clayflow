import { describe, expect, it } from 'vitest';
import { FlowRegistry } from '../flows/FlowRegistry';

// A ordem de gravação por fase, com Flows reais, está em `integration/FlowLifecycle.test.ts`.
describe('fases do quadro', () => {
    it('inclui transform entre physics e shadow', () => {
        expect(new FlowRegistry().phasesInOrder()).toEqual([
            'physics',
            'transform',
            'shadow',
            'forward',
            'post',
            'ui',
        ]);
    });
});
