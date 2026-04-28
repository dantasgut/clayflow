import { PostProcessEffect } from '../../resources/PostProcessEffect';

export class Ssao extends PostProcessEffect {
    get name(): string { return 'Ssao'; }
    get fragmentEntry(): string { return 'fs_ssao'; }
}
