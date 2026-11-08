// Stand-in for the `electron` module in unit tests (aliased in vitest.config.ts). Outside Electron,
// the real package only resolves the path to the Electron binary, and downloads that binary when
// it's missing; parallel test workers then race to unpack it into the same folder (CI has no
// binary). Main-process code under test takes its Electron dependencies as parameters, so any use
// of these is a mistake in the test.

/** An object that fails loudly when a test reaches an Electron API. */
function unavailable(name: string): object {
  return new Proxy(
    {},
    {
      get(_target, property) {
        // Lets the object be inspected (printed, awaited, checked by matchers) without failing.
        if (typeof property === "symbol" || property === "then") return undefined;
        throw new Error(
          `electron.${name}.${property} isn't available in unit tests; pass a fake instead.`,
        );
      },
    },
  );
}

export const app = unavailable("app");
export const safeStorage = unavailable("safeStorage");
export const session = unavailable("session");
export const shell = unavailable("shell");

/** Lets a test check that `electron` resolves to this stand-in. */
export const isUnitTestStub = true;
