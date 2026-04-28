import type { BundleSpec } from '../specs/BundleSpec';

export interface BundleRunner {
    execute(specs: readonly BundleSpec[]): this;
}
