
# sample-sync-websockets

This Decentraland scene demonstrates synchronization of state between networked users over websockets. The user should be able to connect and see other users interacting with the scene.

At this time Decentraland isn't rendering the avatars so imagine in this scene the "ghost cylinders" are like a force field around the players while they are in proximity.

+ See all users moving around the scene
+ Proximity activated tiles
+ Proximity activated door

![example](./img/2018-10-12-websockets01.gif)

![diagram](./img/fig-diagram.png)

## How to do this

+ [Docs](./docs/readme.md)
  * [The Build System](./docs/build-system.md)
  * [Synchronize Websockets](./docs/synchronize-websockets.md)
  * [Proximity Activation Technique](./docs/proximity-activation.md)
  * [Deploy to Zeit Now](./docs/host-on-zeit-now.md)

---

## Install

+ Install node
  * `brew install node`
  * `choco install nodejs`
  * https://github.com/nodesource/distributions
  * https://github.com/creationix/nvm

```sh
git clone https://github.com/tcrowe/sample-sync-websockets.git
cd sample-sync-websockets
npm install
npm run dev
```

Windows users may require `npm install --ignore-scripts` to avoid compilation.

It's going to bind on two ports:
+ Decentraland preview server `127.0.0.1:8834`
+ Websocket server `127.0.0.1:8835`

Open the preview:

`open http://127.0.0.1:8834`

If you open it in multiple windows you can see the other players in the same scene.

---

## Development

It runs a few things in parallel:

```sh
npm run dev
```

All of `dev-*` tasks watch for changes and re-run themselves.

Configure to your preference:

+ [./config.ts](./config.ts)
+ [./tsconfig.json](./tsconfig.json)
+ [./tsconfig-server.json](./tsconfig-server.json)

---

## Production

Just `npm start`!

---

## Contribute

If you notice that I've made an affront to correct TypeScript coding practices please forgive.

Others will want to use this as an example or starting place to fork from. If you see room for improvement please fork, mod, and send back here in a PR.

Thank you! 🤗
