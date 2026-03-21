import type { Material } from '../../scene/components/Material';
import { MaterialDecorator } from './MaterialDecorator';

/**
 * Decorator concreto que renderiza qualquer Material em wireframe.
 *
 * @example
 * const mat = new WireframeDecorator(new StandardMaterial({ color: [0, 1, 0, 1] }));
 * scene.add(new Mesh(new BoxGeometry(), mat));
 */
export class WireframeDecorator extends MaterialDecorator {
    constructor(inner: Material) {
        super(inner);
        this.topology = 'line-list';
    }
}
