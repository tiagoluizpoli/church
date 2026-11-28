import type { ObjectStorage } from '@/domain/contracts/infrastructure/object-storage';

export type TypstFormat = 'pdf' | 'png' | 'svg';

export interface TypstRenderInput {
  /** A directory under the templates root; its `main.typ` is compiled. */
  template: string;
  format: TypstFormat;
  /** 1-based page for PNG and SVG (default 1); a PDF holds every page. */
  page?: number;
  /** PNG resolution (default 200). */
  ppi?: number;
  /**
   * Passed as JSON, never as markup: the template reads
   * `sys.inputs.payload` (a JSON string), or past 128 KiB the file
   * `sys.inputs.payload_file` names.
   */
  payload: unknown;
  /** Embedded in the PDF; a fixed value keeps output byte-identical. */
  creationTimestamp: Date;
  /** Church logo object key; the template reads the file `sys.inputs.logo` names. */
  logoKey?: string;
}

export type TypstPageCountInput = Omit<
  TypstRenderInput,
  'format' | 'page' | 'ppi'
>;

/** Renders Typst templates to files, one CLI process per render (#1242). */
export interface TypstRenderer {
  /** Throws `TypstRenderError` when the render fails or times out. */
  render(input: TypstRenderInput): Promise<Uint8Array>;
  /** The template's page count for the input; throws as `render` does. */
  countPages(input: TypstPageCountInput): Promise<number>;
}

export interface TypstCliRendererConfig {
  binary: string;
  fontsDir: string;
  templatesDir: string;
  /** A render still running after this is killed. */
  timeoutMs: number;
  /** In-memory LRU size for rendered files. */
  cacheBytes: number;
  /** Renders running at once. */
  concurrency: number;
}

export interface TypstCliRendererDependencies {
  objectStorage: ObjectStorage;
  config: TypstCliRendererConfig;
}

export interface TypstDirectoryInput {
  dir: string;
}

/** One render's temporary `--root` and what it compiles. */
export interface TypstRenderRoot {
  root: string;
  input: TypstRenderInput;
}

export interface TypstSpawnInput extends TypstRenderRoot {
  args: string[];
}
