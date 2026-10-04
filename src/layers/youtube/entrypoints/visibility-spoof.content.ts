export default defineContentScript({
  matches: ["https://www.youtube.com/*", "https://m.youtube.com/*"],
  world: "MAIN",
  runAt: "document_start",
  allFrames: true,
  main() {
    // Some pages (notably m.youtube.com) lock these properties down as
    // non-configurable; redefining them then throws. Never let the spoof
    // take the whole content script down — skip quietly when locked.
    spoofGetter(document, "visibilityState", () => "visible");
    spoofGetter(document, "hidden", () => false);
    try {
      document.hasFocus = () => true;
    } catch {
      // Ignore: page locked the method down.
    }

    const isIframe = self !== top;
    if (isIframe) {
      spoofGetter(window, "frameElement", () => null);
    }
  }
});

function spoofGetter(target: object, property: string, get: () => unknown) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(target, property);
    if (descriptor && descriptor.configurable === false) {
      return;
    }

    Object.defineProperty(target, property, {
      get,
      configurable: true
    });
  } catch {
    // Ignore: page does not allow redefinition (e.g. hardened mobile pages).
  }
}
