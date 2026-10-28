# Grove Plugin SDK 1.5

TypeScript types for the host-injected `window.grove`. This package has no runtime and is not published to npm.

From your plugin project, install this directory or an `npm pack` tarball:

```sh
npm install --save-dev /path/to/Town-Client/plugins/sdk
```

For standalone CI, vendor a fixed copy inside the plugin repository and depend on `file:vendor/grove-plugin-sdk`, as [Starmap](https://github.com/chunqing-liu/starmap) does. Commit the lockfile.

All APIs, permissions, minimum versions, examples and publishing instructions are maintained in the [developer guide](../../DEVELOPER-API-SDK.md#grove-插件-sdk). The type contract is [index.d.ts](index.d.ts).

SDK 1.4 adds opt-in plugin agent contracts and Being-scoped records through `grove.agent`. Plugin behavior is discovered through the existing authenticated Portal `@plugins` client command. It does not modify Being prompts, normal chat messages, or the core agent loop. See [agent.d.ts](agent.d.ts) and the developer guide.

SDK 1.5 adds clickable HTTP(S) links and `grove.ui.openExternal()` (`external.open` capability), plus unrestricted HTTP(S) API access (`network` capability). Use browser `fetch` for CORS-enabled endpoints or `grove.network.fetch()` for host requests without browser CORS restrictions. No domain allowlist is required.
