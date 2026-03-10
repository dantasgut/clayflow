import { v4 as uuidv4 } from 'uuid'; // Need to install uuid

/**
 * Classe Base da Engine que encapsula um recurso nativo da Placa Gráfica (GPUObjectBase).
 * Garante que todos os objetos criados na Camada 1 tenham rastreabilidade (Label real na GPU)
 * e métodos seguros de descarte de memória, evitando memory leaks na VRAM.
 */
export abstract class EngineResource<T> {
    public readonly id: string;
    public readonly label: string;
    
    // A referência ao objeto subjacente da API nativa da WebGPU (GPUBuffer, GPUTexture, etc)
    protected rawGpuObject: T | null = null;
    
    // Flag de controle de ciclo de vida
    public isDestroyed: boolean = false;

    constructor(label: string) {
        this.id = uuidv4();
        // O label é forçado estritamente na Engine para rastreabilidade de hardware.
        this.label = label;
    }

    /**
     * Retorna a interface nativa da WebGPU. Lança erro se a memória já foi liberada.
     */
    public get native(): T {
        if (this.isDestroyed || !this.rawGpuObject) {
            throw new Error(`Tentativa de acessar o recurso VRAM nativo '${this.label}' que já foi destruído!`);
        }
        return this.rawGpuObject;
    }

    /**
     * Libera fisicamente este recurso da Placa de Vídeo.
     * Classes derivadas devem sobrescrever este método para chamar o .destroy() nativo adequadamente.
     */
    public destroy(): void {
        this.isDestroyed = true;
        this.rawGpuObject = null;
        // Registro de telemetria base (útil para debug visual da Engine)
        console.log(`[VRAM Liberada] Recurso destruído: ${this.label}`);
    }
}
