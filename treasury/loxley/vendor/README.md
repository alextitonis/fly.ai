# vendor

`viem.js` is [viem](https://viem.sh) (MIT) and the pieces it stands on, bundled into one CommonJS file by
`npm run vendor` from `entry.js`, so that a clone of loxley runs with **no `npm install`**: the terminal, the mock
chain and the 32 tests need nothing but Node 18.

Why bundle instead of listing a dependency: the npm registry is slow or unreachable from a fair share of the
places this desk will be run from, and a sniper you cannot install is not a sniper. The only thing that needs the
registry is the browser desk's own test suite (`npm run test:desk`, Playwright), which is optional.

To rebuild after bumping viem in `devDependencies`:

```sh
npm install                 # once, with a registry in reach
npm run vendor              # writes vendor/viem.js
npm test                    # 32 tests against the mock chain, through the new bundle
```

`cli/deps.js` is the only file that imports the bundle; everything else imports `./deps`. `LICENSES.md` carries the
notices of every package inside the bundle.
