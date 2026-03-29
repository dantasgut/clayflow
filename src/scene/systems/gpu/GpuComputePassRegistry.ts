import type { PhysicsComputePass } from '../PhysicsComputePass';
import type { GpuSimContext }      from '../GpuSimContext';
import { WebGPUEngineCore }        from '../../../core/WebGPUEngineCore';

/**
 * Registry de `PhysicsComputePass` ativos na cena.
 *
 * Responsabilidades:
 * - Registrar/remover passes.
 * - Garantir que cada pass está pronto (`ensureReady()`) antes do primeiro `execute()`.
 * - Delegar `execute()` para cada pass ativo na ordem de registro.
 * - Delegar `dispose()` quando a cena é desconectada.
 *
 * A seleção de quais passes executam sobre quais corpos é feita internamente
 * por cada pass via `acceptedPhysicTypes` — o registry não filtra.
 *
 * Não requer EngineCore no construtor — usa o singleton WebGPUEngineCore lazily
 * em executeAll(), que só é chamado após initialize().
 */
export class GpuComputePassRegistry {

    private readonly passes: PhysicsComputePass[] = [];
    private readonly readySet = new Set<string>();

    /** Registra um pass. Passes são executados na ordem de registro. */
    public register(pass: PhysicsComputePass): void {
        this.passes.push(pass);
    }

    /** Remove e descarta um pass pelo seu `passId`. */
    public unregister(passId: string): void {
        const idx = this.passes.findIndex(p => p.passId === passId);
        if (idx === -1) return;
        const [removed] = this.passes.splice(idx, 1);
        removed!.dispose();
        this.readySet.delete(passId);
    }

    /**
     * Garante que todos os passes estão prontos e executa cada um.
     * Passes ainda em inicialização são silenciosamente ignorados neste frame.
     */
    public async executeAll(context: GpuSimContext, dt: number): Promise<void> {
        const core = WebGPUEngineCore.getInstance();
        for (const pass of this.passes) {
            if (!this.readySet.has(pass.passId)) {
                // Inicia a inicialização sem bloquear — o pass roda a partir do próximo frame
                pass.ensureReady(core).then(() => {
                    this.readySet.add(pass.passId);
                }).catch(err => {
                    console.error(`[GpuComputePassRegistry] ensureReady falhou para "${pass.passId}":`, err);
                });
                continue;
            }
            pass.execute(context, dt);
        }
    }

    /** Libera todos os passes registrados. Chamado ao desconectar a cena. */
    public disposeAll(): void {
        for (const pass of this.passes) {
            pass.dispose();
        }
        this.passes.length = 0;
        this.readySet.clear();
    }

    /** Retorna os passes registrados (somente leitura). */
    public get activePasses(): readonly PhysicsComputePass[] {
        return this.passes;
    }
}
