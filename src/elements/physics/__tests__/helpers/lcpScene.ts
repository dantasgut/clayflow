import { vi } from 'vitest';
import { LCPFlow, type LCPFlowOptions } from '../../flows/LCPFlow';
import { defaultCapabilities } from '../../../../scene/__tests__/helpers/defaultCapabilities';
import { solverScene } from './solverScene';

/** Expõe o aviso de excedente (protegido) para teste. */
export class TestLCPFlow extends LCPFlow {
    overflow(count: number, overflow: number): void {
        this.reportContactOverflow(new Uint32Array([count, overflow, 0, 0]).buffer);
    }
}

/** Cena de teste com o LCP registrado por factory (`bodyType` LCPSchema) e, opcionalmente, o limite de binding. */
export async function lcpScene(options: LCPFlowOptions = {}, maxBinding?: number) {
    const s = await solverScene();
    if (maxBinding !== undefined) {
        const caps = defaultCapabilities();
        vi.mocked(s.core.capabilities).mockReturnValue({
            ...caps,
            limits: { ...caps.limits, maxStorageBufferBindingSize: maxBinding },
        });
    }
    const reg = s.scene.flows.register((ctx) => new TestLCPFlow(ctx, options), {
        type: 'LCPFlow',
        phase: 'physics',
        bodyType: 'LCPSchema',
        priority: 10,
    });
    return { ...s, flow: () => reg.flow! };
}
