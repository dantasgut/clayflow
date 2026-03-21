import { Camera } from './Camera';

/**
 * Câmera com projeção perspectiva. (Camada 3)
 *
 * @example
 * const camera = new PerspectiveCamera(Math.PI / 4, canvas.width / canvas.height, 0.1, 1000);
 * camera.position[1] = 3;
 * camera.position[2] = 8;
 * scene.add(camera);
 * renderer.render(scene, camera);
 */
export class PerspectiveCamera extends Camera {
    constructor(fovY: number, aspect: number, near: number, far: number) {
        super();
        this._cam.setPerspective(fovY, aspect, near, far);
    }

    setPerspective(fovY: number, aspect: number, near: number, far: number): void {
        this._cam.setPerspective(fovY, aspect, near, far);
    }
}
