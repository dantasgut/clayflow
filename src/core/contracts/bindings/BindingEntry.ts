import type { BufferBindingEntry } from './BufferBindingEntry';
import type { SamplerBindingEntry } from './SamplerBindingEntry';
import type { TextureViewBindingEntry } from './TextureViewBindingEntry';

export type BindingEntry = BufferBindingEntry | SamplerBindingEntry | TextureViewBindingEntry;
