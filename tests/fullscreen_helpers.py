"""Test-only Fullscreen API emulation for Playwright browser contexts."""


def emulate_fullscreen(context):
    """Install once before navigation; keep descriptors replaceable by test mocks.

    Desktop fine-pointer contexts start fullscreen so UI smoke tests can reach
    the app. Phones/tablets start outside fullscreen. No production code uses
    this helper, and no native browser fullscreen or user gesture is required.
    """
    context.add_init_script("""(() => {
        let full = matchMedia('(min-width: 1024px) and (pointer: fine)').matches
            ? document : null;
        Object.defineProperty(document, 'fullscreenEnabled', {
            configurable: true, get: () => true,
        });
        Object.defineProperty(document, 'fullscreenElement', {
            // Init scripts may run before <html> exists. Resolve the initial
            // desktop root lazily, without reentering after an explicit exit.
            configurable: true, get: () => full === document ? document.documentElement : full,
        });
        Object.defineProperty(Element.prototype, 'requestFullscreen', {
            configurable: true, writable: true,
            value: async function() {
                full = this;
                document.dispatchEvent(new Event('fullscreenchange'));
            },
        });
        Object.defineProperty(document, 'exitFullscreen', {
            configurable: true, writable: true,
            value: async () => {
                full = null;
                document.dispatchEvent(new Event('fullscreenchange'));
            },
        });
    })();""")