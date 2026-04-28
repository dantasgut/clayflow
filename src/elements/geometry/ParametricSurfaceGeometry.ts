import { ParametricGeometry } from './ParametricGeometry';
import type { ParametricFunction } from './ParametricGeometry';

export class ParametricSurfaceGeometry extends ParametricGeometry {
    constructor(fn: ParametricFunction, values: Record<string, unknown> = {}) {
        super({ ...values, fn });
    }
}
