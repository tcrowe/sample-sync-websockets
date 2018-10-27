
# sample-sync-websockets: The Build System

**This is a guide for describing the whole build system for sample-sync-websockets, from top to bottom.**

Before getting started here you'll need to have the [Decentraland SDK installed](https://docs.decentraland.org/getting-started/create-scene/). Once you have that you can create the scene if you haven't yet.

```sh
mkdir decentraland-websockets
cd decentraland-websockets

# create the scene project
mkdir scene
cd scene
dcl init

# go back out to the project root and create server project
cd ..
mkdir server
npm init
npm install nodemon ts-node
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

The scene already has a TypeScript config file if you used `dcl init`. It's located at `./scene/tsconfig.json`. The server will have slightly different rules so we should create a different TypeScript config file for it.

```sh
# ... from the project root
cd server
touch tsconfig.json
```

`./server/tsconfig.json`

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
  "exclude": ["node_modules"]
}
```

## Development mode

Run the scene in one terminal window:

```sh
cd scene
npm start
```

In another terminal window run the server:

```sh
cd server
npm run watch
```

---

## Production mode

When you're ready, official instructions exist for [Publishing the scene on Decentraland](https://docs.decentraland.org/getting-started/publishing/).

In production the scene will get published to Decentraland so we don't have to worry about that anymore. The server lives outside Decentraland and the users in the scene will connect to it remotely.

```sh
cd server
npm start
```

In real life deployments you likely wont want to use `ts-node` to run the projects. Usually what people will do is compile it with `tsc` then run it with `node`. For simplicity we're just going with `ts-node` here.

---

That's it! You're ready to build and deploy your Decentraland scene.

[Back to ./readme.md](./readme.md)
