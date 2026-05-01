import { PostProcessEffect } from '../../resources/PostProcessEffect';

export class Bloom extends PostProcessEffect {
    get name(): string {
        return 'Bloom';
    }
    get fragmentEntry(): string {
        return 'fs_bloom';
    }
}
