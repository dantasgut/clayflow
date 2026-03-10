import { Entity } from './Entity';

/**
 * Root container lógico para iteração. (Camada 2 Pura)
 * Diferente do WebGL, a Scene WebGPU não se renderiza. Ela é apenas 
 * extraída pelo DoD Pipeline depois.
 */
export class Scene extends Entity {
    // Flag útil p/ Debug
    public isScene: boolean = true;

    // A cor de fundo limpa no inicio do Frame de Render
    public backgroundColor: [number, number, number, number] = [0.1, 0.1, 0.12, 1.0];

    constructor() {
        super();
    }

    /**
     * Aciona forçosamente a atualização da cascata inteira caso os 'Dirty Flags' sujos precisem
     * ser alinhados antes da extração Linear.
     */
    public preRenderUpdate(): void {
        this.updateWorldMatrix(false, true);
    }
}
