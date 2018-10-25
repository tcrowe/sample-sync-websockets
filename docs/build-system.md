
# sample-sync-websockets: The Build System

**This is a guide for describing the whole build system for sample-sync-websockets, from top to bottom.**

Before getting started here you'll need to have the [Decentraland SDK installed](https://docs.decentraland.org/getting-started/create-scene/). Once you have that you can create the scene if you haven't yet.

```sh
mkdir decentraland-websockets
cd decentraland-websockets
dcl init
```

There are a few extra tools we'll use to get the scene and server running.

```sh
# development packages
npm install --save decentraland-rpc nodemon npm-run-all ts-node
```
---

## Stubbing the server

For the sake of simplicity, for testing our build system, let's have the server script output a simple message so we know it worked.

```sh
echo 'console.log("server up");' > server.ts
```

Later we will see "server up" print out in the console.

---

## Configuring TypeScript

The TypeScript config files tell TypeScript build tools how to compile our code and which platform they are targeting. For reference, you can see and adjust all the `compilerOptions` using [this guide](https://www.typescriptlang.org/docs/handbook/compiler-options.html).

The scene already has a TypeScript config file if you used `dcl init`. It's located at `./tsconfig.json`. The server will have slightly different rules so we should create a different TypeScript config file for it.

```sh
touch tsconfig-server.json
```

`./tsconfig-server.json`

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "target": "ES6",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "allowSyntheticDefaultImports": false,
    "newLine": "lf",
    "stripInternal": true,
    "strict": true,
    "baseUrl": ".",
    "removeComments": true,
    "outDir": ".",
    "pretty": true,
    "lib": ["es2017"]
  },
  "include": ["./server.ts"],
  "exclude": []
}
```

At the bottom of `./tsconfig.json` we need to change the `include` and `exclude` properties so TypeScript and Decentraland's scripts don't get confused.

`./tsconfig.json`

```json
{
  "compilerOptions": {
    "module": "esnext",
    "target": "es2017",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "sourceMap": true,
    "moduleResolution": "node",
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
    "outDir": ".",
    "pretty": true,
    "lib": ["es2017", "dom"]
  },
  "include": ["./scene.tsx"],
  "exclude": []
}
```

---

## Putting it all together

Now we're ready to connect the build tools together and run the development tasks in parallel.

`./package.json` `scripts` section

```json
"scripts": {
  "watch": "echo 'watch placeholder'",
  "dev-compile": "decentraland-compiler build.json --watch || true",
  "dev-dcl-start": "dcl start --port 8834 --no-browser --no-watch || true",
  "dev-server": "nodemon -q -L -d 1 -w '*.ts' --ext ts --exec ts-node --project tsconfig-server.json --pretty server.ts || true",
  "dev": "run-p dev-*",
  "start": "ts-node --project tsconfig-server.json --pretty server.ts"
}
```

Now you can do:

```sh
npm run dev
```

It will watch for changes and update both the scene and server accordingly.

The tool we installed earlier called `npm-run-all` is giving us this command `run-p` to *run parallel* `npm` tasks. So when we run that `npm run dev` task it will do these three tasks at the same time:

+ `dev-compile` compile `./scene.tsx`
+ `dev-dcl-start` run the Decentraland preview server
+ `dev-server` run `./server.ts` the file we created above.

Using ` || true` in the scripts above just tells npm to be quiet about error messages that may occur while we're developing.

The `watch` placeholder above is temporarily circumventing `dcl start` trying to run the compiler. We're handling that ourselves within the custom development scripts here.

---

## Production mode

In production the scene will get published to Decentraland so we don't have to worry about that here. But the server lives outside Decentraland and the users in the scene will connect to it remotely.

```sh
npm start
```

The command `npm start` was configured above and it's custom to this tutorial. Decentraland's CLI tool `dcl init` will also create `npm start` script but we are overriding it. This will be useful to have in order to publish the server to somewhere like [Zeit Now](https://zeit.co/now). Services like that rely on the `start` script.

In real life deployments you likely wont want to use `ts-node` to run the projects. Usually what people will do is compile it with `tsc` then run it with `node`. For simplicity we're just going with `ts-node` here.

---

That's it! You're ready to build and deploy your Decentraland scene.

[Back to ./readme.md](./readme.md)
