
# sample-sync-websockets: The Build System

**This is a guide for describing the whole build system for sample-sync-websockets, from top to bottom.**

There are a few tools we'll use to get the scene and server built and running.

```sh
npm install --save decentraland decentraland-api decentraland-rpc nodemon npm-run-all prettier tslint
```

We're going to put our source code into `./src` and output our compiled assets into `./dist`.

```sh
# we need somewhere for the compiled files to go
mkdir -p dist/scene dist/server

# and somewhere for our source to live
mkdir -p src/scene src/server
```

We want to be able to delete and rebuild the `./dist` directory at any time. It's helpful to automate the tear-down & build-up process into `./package.json`. To do this, add new commands under `scripts`.

```json
"scripts": {
  "clean": "rm -rf dist",
  "setup": "mkdir -p dist/scene dist/server"
}
```

Now this repetitive task can be automatically done as part of the build process.

Try it like so:

```sh
# verify no more ./dist after this
npm run clean

# ./dist/scene and ./dist/server should be created once again
npm run setup
```

---

For the sake of simplicity, for testing our build system, let's just compile a simple message.

```sh
echo 'console.log("scene up");' > src/scene/index.tsx
echo 'console.log("server up");' > src/server/index.ts
```

---

## Configuring TypeScript

The TypeScript config files tell TypeScript build tools how to compile our code and which platform they are targeting. For reference, you can see and adjust all the `compilerOptions` using [this guide](https://www.typescriptlang.org/docs/handbook/compiler-options.html).

```sh
# instructions so TypeScript can do it's job
touch src/scene/tsconfig.json
touch src/server/tsconfig.json
```

`./src/scene/tsconfig.json`

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "target": "ESNext",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "sourceMap": true,
    "moduleResolution": "Node",
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "allowSyntheticDefaultImports": false,
    "newLine": "lf",
    "stripInternal": true,
    "baseUrl": ".",
    "strict": true,
    "jsx": "react",
    "jsxFactory": "DCL.createElement",
    "removeComments": true,
    "outDir": "../../dist/scene",
    "pretty": true,
    "lib": ["ESNext", "DOM", "WebWorker"]
  }
}
```

In this project, we've specified a `strict` style so that our code conforms to what The Wise Elders of TypeScript™️ think is right. 😉

+ `outDir` points to where we want the compiled files to end up.
+ `jsxFactory` tells TypeScript to use `DCL.createElement` instead of `React.createElement`.
+ `lib` signals that TypeScript should understand that this will use some APIs in the browser, specifically `WebWorker`.

The file `./src/server/tsconfig.json` that our *server* uses is only slightly different from the one the *scene* uses.

`./src/server/tsconfig.json`

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "target": "ES6",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "sourceMap": true,
    "moduleResolution": "Node",
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "allowSyntheticDefaultImports": false,
    "newLine": "lf",
    "stripInternal": true,
    "baseUrl": ".",
    "strict": true,
    "removeComments": true,
    "outDir": "../../dist/server",
    "pretty": true,
    "lib": ["ESNext"]
  }
}
```

+ Target `node` so output `ES6` code
+ No `react` stuff is necessary

---

## Configure Decentraland scene

For this tutorial we've most of the fields blank so others can choose if they want to fill it in.

+ `"owner": "0x000..."` is the Ethereum address.
+ `"main": "dist/scene/index.js"` tells Decentraland where the scene is

```json
{
  "assets": {},
  "owner": "",
  "contact": {
    "name": "",
    "email": "",
    "url": ""
  },
  "main": "dist/scene/index.js",
  "scene": {
    "base": "0,0",
    "parcels": ["0,0"]
  },
  "communications": {
    "type": "webrtc",
    "signalling": "https://rendezvous.decentraland.org"
  },
  "policy": {},
  "display": {
    "title": "sample-sync-websockets",
    "description": "Fast multiplayer state synchronization via websockets"
  }
}
```

---


## Configuring Decentraland's compiler

In this project we use `decentraland-compiler` to compile *both* the scene and server. It's nice to have this flexible tool that can do that.

In the project root, let's create two `json` files that tell `decentraland-compiler` how to do its job.

```sh
touch build-scene.json
touch build-server.json
```

`./build-scene.json`

```json
[
  {
    "name": "scene",
    "kind": "Webpack",
    "file": "./src/scene/index.tsx",
    "config": "./src/scene/tsconfig.json",
    "target": "webworker"
  }
]
```

In this file we're saying the scene should be compiled with Webpack, to be deployed for a WebWorker, and here's our TypeScript file too. Go compile it Mr. `decentraland-compiler`! 🤓

`./build-server.json`

```json
[
  {
    "name": "server",
    "kind": "TSC",
    "config": "./src/server/tsconfig.json"
  }
]
```

This configuration is simpler. We're just instructing to compile the server with TSC and here's the TypeScript config.

Now that we have a `tsconfig.json` and a Decentraland build file for both the scene and for the server, we can add these scripts into the `./package.json`.

```json
"scripts": {
  "dev-compile-scene": "decentraland-compiler build-scene.json --watch || true",
  "dev-compile-server": "decentraland-compiler build-server.json --watch || true"
}
```

All that does is tell Decentraland to watch for changes and rebuild. We're almost *there*.

---

## Configuring TSLint

Next is TSLint. TSLint can both analyze and fix the code.

```sh
touch tslint.json
```

`./tslint.json`

```json
{
  "defaultSeverity": "error",
  "extends": ["tslint:recommended"],
  "jsRules": {},
  "rules": {
    "no-console": false,
    "no-var-requires": false,
    "trailing-comma": false
  },
  "rulesDirectory": []
}
```

These scripts look a bit complicated (and they are) but they help TSLint watch for changes and re-scan our code.

```json
"scripts": {
  "dev-tslint-scene": "nodemon -q -L -d 1 -w src/scene --ext ts,tsx --exec tslint --config tslint.json --format stylish --project src/scene/tsconfig.json || true",
  "dev-tslint-server": "nodemon -q -L -d 1 -w src/server --ext ts,tsx --exec tslint --config tslint.json --format stylish --project src/server/tsconfig.json || true"
}
```

So `nodemon` is doing the following:
+ running quietly `-q`
+ legacy file watch `-L`
+ with a delay of one second `-d 1`
+ scanning for `*.ts` and `*.tsx` files `--ext ts,tsx`
+ inside our source directories `-w src/scene` `-w src/server`
+ run TSLint using `--exec tslint`
+ using our tslint for style rules `--config tslint.json`
+ formatting in a stylish way `--format stylish`
+ using our tsconfig for guidance `--project src/scene/tsconfig.json`

If you keep seeing ` || true` that just tells npm to be quiet if an error happens.

---

## Putting it all together

Now we're ready to put the last pieces together and run all our development tasks in parallel.

```json
"scripts": {
  "dev-dcl": "dcl start --port 8834 || true",
  "dev-server": "sleep 6 && nodemon -q -L -d 1 -w dist/server dist/server/index.js || true",
  "dev": "run-p setup dev-*"
}
```

```sh
npm run dev-server
```

+ wait for `decentraland-compiler` and `tslint` to do their job `sleep 6`
+ watch the for the compiled server files `-w dist/server`
+ and re-run the compiled server after it changes `dist/server/index.js`

```sh
npm run dev
```

This ties all of our `dev-*` `./package.json` `scripts` together. `run-p setup dev-*` tells `npm` to run the script `setup` and any other script that matches `dev-*` in parallel. That's what the `npm-run-all` module gives us.

---

## Production mode

We use much of the same scripts and tools as above, sans `|| true`. If these output errors, we want execution to stop.

```json
"scripts": {
  "prd-prettier": "prettier --write src/{scene,server}/**/*.{ts,tsx}",
  "prd-tslint-scene": "tslint --config tslint.json --fix --project src/scene/tsconfig.json",
  "prd-tslint-server": "tslint --config tslint.json --fix --project src/server/tsconfig.json",
  "prd-compile-scene": "NODE_ENV=production decentraland-compiler build-scene.json",
  "prd-compile-server": "NODE_ENV=production decentraland-compiler build-server.json",
  "prd-server": "NODE_ENV=production node dist/server/index.js",
  "prd": "run-s clean setup prd-*"
}
```

See how `run-s` at the bottom will run our tasks in series, not parallel, like the development tasks did.

+ delete `./dist` with `npm run clean`
+ re-run our `npm run setup`
+ format our code using [prettier](https://prettier.io)
+ `tslint` with `--fix` for all our code
+ compile
+ run the server

---

That's it! You're ready to build and deploy your Decentraland scene.

[Back to ./readme.md](./readme.md)
