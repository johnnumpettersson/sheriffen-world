declare module "pica" {
  interface PicaInstance {
    resize(
      from: HTMLImageElement | HTMLCanvasElement,
      to: HTMLCanvasElement,
      options?: Record<string, unknown>,
    ): Promise<HTMLCanvasElement>;
  }

  function pica(options?: Record<string, unknown>): PicaInstance;
  export default pica;
}
