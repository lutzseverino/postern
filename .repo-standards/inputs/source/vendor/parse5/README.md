# parse5

This directory retains a bundled ESM `parseFragment` export from
[parse5 8.0.1](https://www.npmjs.com/package/parse5/v/8.0.1) and its
[entities 8.0.0](https://www.npmjs.com/package/entities/v/8.0.0) dependency.
Authored operations can inspect rendered HTML structure without an adopter-side
package installation.

`parse5.esm.js` was bundled for Node.js 24 with esbuild 0.25.10 from the
published `parse5@8.0.1` (`sha1-f43bcd2cd683efe084075333e9ce0da7d06da31e`)
and `entities@8.0.0` (`sha1-c1df5fe3602429747fa233d0dd26f142f0ce4743`)
npm packages. Its SHA-256 checksum is
`bdf861eb0bce411afe5fcc312c770c3fe18dac9b5296771d40217d52a6ae7a93`.
The source licenses are retained as `LICENSE.parse5` and `LICENSE.entities`.
Keep this directory as an explicit operation resource when wiring declarations.
