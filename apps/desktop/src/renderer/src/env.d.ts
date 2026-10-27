import type { KadrApi } from "../../shared/api";

declare global {
  interface Window {
    readonly kadr: KadrApi;
  }
}
