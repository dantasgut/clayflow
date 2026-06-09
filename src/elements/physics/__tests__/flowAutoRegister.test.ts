import { describe, it, expect } from 'vitest';
import { FlowRegistry } from '../../../scene/flows/FlowRegistry';
import type { EngineCore } from '../../../core/contracts/index';
import type { World } from '../../../scene/world/World';
import type { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import { autoRegisterFlows } from '../flows/defaultFlows';
import { LCPFlow } from '../flows/LCPFlow';
import { RigidBody } from '../bodies/RigidBody';

// Stubs: os ctors de Flow apenas armazenam as deps (não tocam GPU na construção).
const core = {} as unknown as EngineCore;
const world = {} as unknown as World;
const resources = {} as unknown as ResourceSystem;

describe('autoRegisterFlows (T006 / FR-004)', () => {
    it('registra o LCPFlow para um RigidBody (LCPSchema) sem flow', () => {
        const flows = new FlowRegistry();
        const body = new RigidBody({ shape: 'sphere', radius: 0.4, mass: 1 });
        expect(flows.resolve('LCPSchema')).toBeUndefined();
        autoRegisterFlows([body], flows, core, world, resources);
        expect(flows.resolve('LCPSchema')).toBeInstanceOf(LCPFlow);
    });

    it('registro manual prévio tem precedência (não duplica)', () => {
        const flows = new FlowRegistry();
        const manual = new LCPFlow(core, world, resources);
        flows.register(manual);
        const before = flows.flowsInPhase('physics').length;
        autoRegisterFlows(
            [new RigidBody({ shape: 'box', halfExtents: [1, 1, 1], mass: 1 })],
            flows,
            core,
            world,
            resources,
        );
        expect(flows.resolve('LCPSchema')).toBe(manual);
        expect(flows.flowsInPhase('physics').length).toBe(before);
    });

    it('idempotente — 2ª chamada não adiciona segundo flow', () => {
        const flows = new FlowRegistry();
        const body = new RigidBody({ shape: 'sphere', radius: 0.4, mass: 1 });
        autoRegisterFlows([body], flows, core, world, resources);
        const after1 = flows.flowsInPhase('physics').length;
        autoRegisterFlows([body], flows, core, world, resources);
        expect(flows.flowsInPhase('physics').length).toBe(after1);
    });

    it('ignora resources sem schema mapeado (ex.: schema desconhecido)', () => {
        const flows = new FlowRegistry();
        // Um RigidBody cru com schema arbitrário não mapeado não registra flow.
        autoRegisterFlows([], flows, core, world, resources);
        expect(flows.flowsInPhase('physics').length).toBe(0);
    });
});
