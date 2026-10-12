/**
 * Tabelas de transição dos solvers (R5): cada solver tem um estado (`running`); a tabela declara todo evento que a C2
 * lhe pode entregar, e evento fora dela lança. Em cena real, os eventos provocados (pool que cresce, corpos
 * removidos) são tratados sem sair do estado nem do ciclo `ready`.
 */
import { describe, expect, it } from 'vitest';
import type { Flow } from '../../../scene/flows/Flow';
import { DEFAULT_SOLVER_REGISTRATIONS } from '../flows/defaultFlows';
import { expectTransitionTable } from '../../../scene/__tests__/helpers/flowEvents';
import { renderScene } from '../../../presentation/flows/__tests__/helpers/renderHarness';
import { insertGravity, insertSolverBodies } from './helpers/solverBodies';

const SOLVERS = ['LCPFlow', 'XPBDFlow', 'FEMFlow', 'MPMFlow', 'SPHFlow', 'PBFFlow'];

async function solversScene() {
    const s = await renderScene();
    for (const r of DEFAULT_SOLVER_REGISTRATIONS) s.scene.flows.register(r.factory, r.options);
    insertGravity(s.scene.world);
    insertSolverBodies(s.scene.world);
    for (let i = 0; i < 3; i++) s.step();
    const solvers = (): Flow[] => [...s.scene.flows.flowsInPhase('physics')];
    return { ...s, solvers };
}

describe('solvers — tabelas de transição', () => {
    it('os seis solvers (sete instâncias, MPM sólido e fluido) ficam prontos em `running`', async () => {
        const s = await solversScene();
        const flows = s.solvers();
        expect(new Set(flows.map((f) => f.type))).toEqual(new Set(SOLVERS));
        expect(flows).toHaveLength(7);
        for (const flow of flows) {
            expect(flow.lifecycle, flow.type).toBe('ready');
            expect(flow.state, flow.type).toBe('running');
        }
    });

    it('cada tabela declara todo evento entregável e lança nos demais', async () => {
        const s = await solversScene();
        for (const flow of s.solvers()) expectTransitionTable(flow);
    });

    it('pools que crescem e corpos removidos: tratados sem sair de running/ready', async () => {
        const s = await solversScene();
        const inserted = [];
        for (let k = 1; k <= 40; k++) inserted.push(...insertSolverBodies(s.scene.world, k * 10));
        s.step();
        for (const body of inserted.slice(0, 50)) s.scene.world.remove(body);
        s.step();
        s.step();
        for (const flow of s.solvers()) {
            expect(flow.lifecycle, flow.type).toBe('ready');
            expect(flow.state, flow.type).toBe('running');
        }
        expect(s.createdWhileRecording()).toBe(0);
    });
});
