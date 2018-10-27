
# sample-sync-websockets: Websocket Synchronization

The main trick we intend to show off with the `sample-sync-websockets` sample is how to get all the clients and the server synchronized via websockets. Some challenges arise while trying to accomplish this task. 🤔

+ If the server and the Decentraland preview run on different ports, how can you communicate *across origin*?
+ What if someone is sending garbage, trying to junk up the synchronized state?
+ What if a user or the server disconnects and maybe also reconnects?

All those are things we considered while making this project.

---

We need to install some tools before we get started with this. [socket.io](https://socket.io) is a popular set of modules for this type of task.

```sh
cd scene
npm install --save @types/lodash @types/socket.io-client lodash socket.io-client

cd ../server
npm install --save @types/cors @types/express @types/lodash @types/socket.io cors decentraland-api express nodemon socket.io ts-node typescript
```

---

Below is a simplified version of the server app to demonstrate communication back and forth from the client and server.

`./server/server.ts`

```ts
import * as cors from "cors";
import * as express from "express";
import * as http from "http";
import * as socketio from "socket.io";

//
// express will allow us to more easily use CORS
//
const expressApp: express.Application = express();

// connect an http server with express because we need to be able
// to gracefully shut it down or attack socket.io to it
const httpServer: http.Server = http.createServer(expressApp);

// socket.io
const socketServer: socketio.Server = socketio(httpServer, {
  // we don't need it to serve the js client
  serveClient: false,
  // only use websockets
  transports: ["websocket"],
});

// we're communicating across different ports(origin) from the preview
expressApp.use(cors());
```

The example above shows how we can connect `http`, `express`, and `socket.io` together.

`expressApp.use(cors());` is a key component, allowing us to bridge the gap *across origins*. The Decentraland preview runs on one port and our server is running on another port. Without CORS, Cross-Origin Resource Sharing, the browser would not allow these two different processes to speak to one another, even though they are both running on our machine.

---

## Graceful shutdown

You should, where possible, get the server to gracefully shut down so that it doesn't accidentally keep ports open. It will annoy and frustrate users to no end if you don't.

`./server/server.ts`

```ts
/**
 * Try to gracefully shutdown the server passing an exit code to the shell
 */
function shutdown(code: number = 0) {
  let exitCode: number = code;

  // stop socket.io
  try {
    socketServer.close();
  } catch (e) {
    console.error("error closing socket.io", e);
    exitCode = 1;
  }

  // stop node http server
  try {
    httpServer.close();
  } catch (e) {
    console.error("error closing http server", e);
    exitCode = 1;
  }

  // be a good CLI developer and give the correct exit code
  // 0 = everything worked fine
  // 1 = there was an error somewhere
  process.exit(exitCode);
}

//
// handle other processes telling this one to shut down
//
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
```

---

## Start the http server

`./server/server.ts`

```ts
const port = 8835;

httpServer.listen(port, (err?: Error) => {
  if (err !== undefined && err !== null) {
    console.error("error binding http server", err);

    // use our graceful shutdown function
    return shutdown(1);
  }

  // let the user know its up
  console.log("http server listening", port)
});
```

---

## Start socket.io

`./server/server.ts`

```ts
socketServer.on("connect", (socket: socketio.Socket) => {
  console.log("socket.io connection", socket.id);

  socket.on("error", (err: Errr) => {
    console.error("socket.io socket error", err);
  });

  //
  // we'll handle the socket events later
  // + disconnect
  // + character-join
  // + character-position
  // + character-rotation
  // + character-ping
  // + introduce
  //
});

socketServer.on("error", (err: Error) => {
  console.error("socket.io server error", err);
});
```

You can see if it worked by running `npm run dev`.

---

## Error handling and graceful shutdown

All we have so far is setting up these server objects and handling error cases. The reasoning is that during development, as mere mortals, there could be a lot of errors coming our way. If we don't watch for the errors and report them to the console then we might not understand why things aren't working. Because of that, we want to handle just about every event we can and give meaningful feedback to the terminal.

It might seem boring or tedious, but the mark of a good programmer is someone who can deliver to users an app that works reliably for long periods of time. We want to make the user and our colleagues happy and not give them anything to complain about.

We also benefit by having a less awful troubleshooting process.

---

## CharacterManager

The approach we took in this project is called `CharacterManager`. It's the gatekeeper for the messages being sent between the client and server.

The `character-manager.ts` file contains these methods:

+ `cancelExpiration(id: string)`
+ `scheduleExpiration(id: string)`
+ `characterJoin(joinEvent: ICharacterJoinEvent)`
+ `characterPart(partEvent: ICharacterPartEvent)`
+ `updateCharacterPosition(positionEvent: ICharacterPositionEvent)`
+ `updateCharacterRotation(rotationEvent: ICharacterRotationEvent)`
+ `ping(pingEvent: ICharacterPingEvent)`
+ `characterList()`

The `CharacterManager` class handles each of these user events coming from websockets, validates them, and usually returns a tuple. `[success, error]` The class uses a hash table, a JavaScript `Object`, to save the character information. It will allows us to broadcast that information out to every other user.

See the following files for how this was implemented:
+ [./server/lib/character-manager.ts](./server/lib/character-manager.ts)
+ [./server/lib/character.ts](./server/lib/character.ts)
+ [./server/lib/formats.ts](./server/lib/formats.ts)
+ [./server/lib/config.ts](./server/lib/config.ts)

It might be easier for the sake of the tutorial to copy these files into your project unless you're comfortable with TypeScript or want to learn. Either way you can use them as a guide.

---

## Socket.io Socket events

Now that we've gone over the `CharacterManager` class and what it can do, let's instance one of these objects and wire it up to socket.io.

`./server/server.ts`

```ts
const characterManager = new CharacterManager();

socketServer.on("connect", (socket: socketio.Socket) => {
  let characterId: string | undefined;

  console.log("socket.io client connection", socket.id);

  socket.on("error", (err: Errr) => {
    console.error("socket.io socket error", err);
  });

  /**
   * When someone joins we can send them everyone else's name and coordinates.
   */
  const introduceCharacters = throttle(() => {
    characterManager
      .characterList()
      // don't send us our own info
      .filter((item) => item.id !== characterId)
      // but send us everyone else's
      .forEach((char) => {
        socket.emit("character-join", char);
      });
  }, 1000);

  /**
   * When someone disconnects remove their info from the CharacterManager hash table
   * Also, tell everyone else that they disconnected.
   */
  socket.on("disconnect", () => {
    if (characterId !== undefined) {
      const partEvent = { id: characterId };
      characterManager.characterPart(partEvent);
      socketServer.emit("character-part", partEvent);
    }
  });

  /**
   * When someone joins the server let's remember their id and introduce
   * them to all the other users.
   */
  socket.on("character-join", (evt: any) => {
    const [success, error] = characterManager.characterJoin(evt);

    if (success === true) {
      console.log("character join", evt);
      const { id } = evt;
      characterId = id;
      socket.broadcast.emit("character-join", evt);

      // Someone joined so introduce them to everyone else
      introduceCharacters();
      return;
    }

    console.error("character join error", error, evt);
  });

  /**
   * Decentraland has an API to get the coordinates of the user. From
   * their scene they send this coordinate to us. It's then broadcasted to
   * everyone who is connected.
   */
  socket.on("character-position", (evt: any) => {
    const [success, error] = characterManager.updateCharacterPosition(evt);

    if (success === true) {
      console.log("character position", evt);
      socket.broadcast.emit("character-position", evt);
      return;
    }

    console.error("character position error", error, evt);
  });

  /**
   * The same goes for rotation. Decentraland offers a way for the scene to
   * get the user's rotation. Their scene sends that to the server so it can broadcast
   * to everyone else who is connected.
   */
  socket.on("character-rotation", (evt: any) => {
    const [success, error] = characterManager.updateCharacterRotation(evt);

    if (success === true) {
      console.log("character rotation", evt);
      socket.broadcast.emit("character-rotation", evt);
      return;
    }

    console.error("character rotation error", error, evt);
  });

  /**
   * Pings allow us to keep everyone fresh in memory. If they don't respond, their info
   * is discarded.
   */
  socket.on("character-ping", (evt: any) => {
    const [success, error] = characterManager.ping(evt);

    if (success === true) {
      console.log("character ping", evt);
      return;
    }

    console.error("character ping error", error, evt);
  });

  /**
   * The client can say "Woops, I have a problem. Introduce us again"
   */
  socket.on("introduce", () => introduceCharacters());
});
```

---

## Connect a Decentraland scene to socket.io

Now that our server is set up to broadcast user coordinates to each other, we should start sending those coordinates the the server! Decentraland scenes operate inside a `WebWorker`, not the DOM, so some things are different from typical web development. For example, there is no `window` object.

Decentraland's `ScriptableScene` object has a few facilities we will use to accomplish connecting to the server and send it our information.

+ `sceneDidMount`
+ `positionChanged`
+ `rotationChanged`

`./scene/scene.tsx`

```ts
import * as DCL from "decentraland-api";
import * as io from "socket.io-client";
import { CharacterManager } from "./lib/character-manager";

//
// The scene has its own CharacterManager, that is similar to the one in the server
// It will help us keep track of who is in our scene.
//
const characterManager = new CharacterManager()

export interface IState {
  connected: boolean;
  reconnects: number;
}

export default class WebsocketScene extends DCL.ScriptableScene<any, IState> {
  //
  // State changes tell Decentraland when it should re-render the scene.
  // We will use `this.setState({ connected: true })` and `this.forceUpdate()`
  //
  public state: IState = {
    connected: false,
    reconnects: 0
  }

  // socket.io must uses CORS to connect across origins
  // preview server ➡️ http://127.0.0.1:8834
  // websocket server ➡️ http://127.0.0.1:8835
  private socket = io("http://127.0.0.1:8835", {
    // ⚠️ don't automatically connect, this is explained below
    autoConnect: false,
    // jsonp is impossible in this context (WebWorker)
    jsonp: false,
    // give up after failing too many times
    reconnectionAttempts: 30,
    // only use websockets, not polling
    transports: ["websocket"],
  });

  public sceneDidMount() {
    const { socket } = this;

    socket.on("connect", () => {
      this.setState({ connected: true });
    });

    socket.on("disconnect", () => {
      console.error("socket.io disconnect")
      this.setState({ connected: false });
    });

    /**
     * Similar to the server example, we're just handling all these weird events
     * so that if they occur we get some feedback why it's screwing up.
     */
    socket.on("connect_error", (err: Error) => console.error("socket.io connect_error", err));
    socket.on("connect_timeout", (err: Error) => console.error("socket.io connect_timeout", err));
    socket.on("error", (err: Error) => console.error("socket.io error", err));
    socket.on("reconnect_attempt", () => console.warn("socket.io reconnect_attempt"));
    socket.on("reconnecting", () => console.warn("socket.io reconnecting"));
    socket.on("reconnect_error", (err: Error) => console.error("socket.io reconnect_error", err));
    socket.on("reconnect_failed", (err: Error) => console.error("socket.io reconnect_failed", err));

    /**
     * It might be interesting to see how many times we are reconnecting
     * so this number can be incremented and saved into state.
     */
    socket.on("reconnect", () => {
      let { reconnects } = this.state
      reconnects += 1;
      this.setState({ reconnects });
    });

    // ⚠️ We used the socket.io option `autoConnect: false` because
    // we want to wire up all the events before it connects
    socket.connect()
  }

  public async render () {
    return <scene/>;
  }
}
```

---

## Track character events from others

Above we were just concerned with bootstrapping our scene with socket events and basic state. It's ready for any errors that may come up, *for those of us who are just humans that make errors*. Now we can hook up to events sent by the server that relate to other users. This isn't exactly how we did it in the example app. It's a simplified version printing all the output to the console.

`./scene/scene.tsx` Still inside `sceneDidMount() {}`:

```ts
socket.on("character-join", (evt: any) => {
  const [success, error] = characterManager.characterJoin(evt);
  console.log("character-join", evt, success, error);
  // What do you want to react to new characters joining?
});

socket.on("character-part", (evt: any) => {
  const [success, error] = characterManager.characterPart(evt);
  console.log("character-part", evt, success, error);
  // What do you want to react to characters leaving?
});

socket.on("character-position", (evt: any) => {
  const [success, error] = characterManager.updateCharacterPosition(evt);
  console.log("character-position", evt, success, error);
  // Do you want to react to character movements?
});
socket.on("character-rotation", (evt: any) => {
  const [success, error] = characterManager.updateCharacterRotation(evt);
  console.log("character-rotation", evt, success, error);
  // Do you want to react to where players are looking at?
});
```

---

## Track our own events and send them

The final step is to have the scene send event data about its own `Character` to the server. The server then relays that information to everyone else.

`./scene/scene.tsx`

```ts
// This should be at the top of the file ⤴️
import { Character } from "./lib/character";
const character = new Character();

// This should be down inside the sceneDidMount() function: ⤵️

//
// Tracking user movements (using W-A-S-D keys)
//
this.subscribeTo("positionChanged", (evt: any) => {
  const { id } = character;
  const { position } = evt;
  character.position = position;
  socket.emit("character-position", { id, position });
  // update our tiles?
  // update our doors?
  // how do you want the scene to react to your own movement?
});

//
// Tracking view rotation like mouse-look, phone, or VR view rotate.
//
this.subscribeTo("rotationChanged", (evt: any) => {
  const { id } = character;
  const { rotation } = evt;
  character.rotation = rotation;
  socket.emit("character-rotation", { id, rotation });
  // how do you want the scene to react to your own rotation?
});
```

---

So now we have:

+ The server is running HTTP, Websockets, and CORS
+ The Decentraland scene connects to the server
+ The scenes send data about all their events
+ The server relays all the data to other users
+ Both scene and server synchronize using `CharacterManager` object

Load up the scene, move around, and look at the developer console in the browser and your server.

[Back to ./readme.md](./readme.md)
