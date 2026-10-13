import { Transform } from '../../../elements/scene/Transform';
import type { Input } from '../Input';
import { InputDrivenController } from '../InputDrivenController';

/**
 * Opções do OrbitController. Todas opcionais com defaults sensíveis.
 */
export interface OrbitControllerOptions {
    /** Ponto que a câmera orbita. Default: [0, 0, 0] (origem). */
    readonly target?: readonly [number, number, number];
    /** Distância inicial entre câmera e target (raio do orbit). Default: 5. */
    readonly distance?: number;
    /** Quando true, rotaciona automaticamente sem input do usuário. */
    readonly autoRotate?: boolean;
    /** Radianos/segundo de auto-rotação (se habilitada). Default: 0.5. */
    readonly autoRotateSpeed?: number;
    /** Coeficiente de damping em [0, 1]: 0 = sem damping (parada brusca),
     * 1 = sem amortecimento (gira eternamente). Default 0.85. */
    readonly damping?: number;
    /** Sensibilidade do pinch (touch) em distance units por pixel. */
    readonly pinchSensitivity?: number;
}

/**
 * OrbitController com damping (inércia) por canal: theta, phi, distance. Cada canal acumula a velocidade do arrasto,
 * da roda ou da pinça e decai depois que o usuário solta. Componente da entidade da câmera: a cada quadro posiciona o
 * `Transform` na esfera em torno do alvo e o orienta para ele (`Transform.lookRotation`).
 */
export class OrbitController extends InputDrivenController {
    private theta = 0;
    private phi = Math.PI / 4;
    private distance: number;
    private vTheta = 0;
    private vPhi = 0;
    private vDistance = 0;
    private readonly target: [number, number, number];
    private readonly autoRotate: boolean;
    private readonly autoRotateSpeed: number;
    private readonly damping: number;
    private readonly pinchSensitivity: number;

    constructor(options: OrbitControllerOptions = {}) {
        super();
        this.target = [...(options.target ?? [0, 0, 0])] as [number, number, number];
        this.distance = options.distance ?? 5;
        this.autoRotate = options.autoRotate ?? false;
        this.autoRotateSpeed = options.autoRotateSpeed ?? 0.5;
        this.damping = Math.max(0, Math.min(1, options.damping ?? 0.85));
        this.pinchSensitivity = options.pinchSensitivity ?? 0.01;
    }

    /** Integra arrasto, roda e pinça com damping e reposiciona o `Transform` da câmera em órbita do alvo. */
    tick(input: Input, dt: number, transform: Transform): void {
        const delta = input.pointerDelta();
        if (input.isButtonDown('left')) {
            this.vTheta = -delta.dx * 0.005;
            this.vPhi = -delta.dy * 0.005;
        } else {
            // Sem arrasto: damping decai velocidade exponencialmente.
            this.vTheta *= this.damping;
            this.vPhi *= this.damping;
        }
        if (input.wheelDelta() !== 0) {
            this.vDistance = input.wheelDelta() * 0.001;
        } else if (input.pinchDelta() !== 0) {
            // pinch positivo (afasta dedos) deve diminuir distance (zoom-in).
            this.vDistance = -input.pinchDelta() * this.pinchSensitivity;
        } else {
            this.vDistance *= this.damping;
        }

        this.theta += this.vTheta;
        this.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.phi + this.vPhi));
        if (this.vDistance !== 0) {
            this.distance = Math.max(0.5, Math.min(100, this.distance * Math.exp(this.vDistance)));
        }
        if (this.autoRotate) this.theta += this.autoRotateSpeed * dt;

        const [tx, ty, tz] = this.target;
        const eye: [number, number, number] = [
            tx + this.distance * Math.sin(this.phi) * Math.cos(this.theta),
            ty + this.distance * Math.cos(this.phi),
            tz + this.distance * Math.sin(this.phi) * Math.sin(this.theta),
        ];
        transform.data.position = [...eye, 1];
        transform.data.rotation = Transform.lookRotation(eye, this.target);
    }
}
