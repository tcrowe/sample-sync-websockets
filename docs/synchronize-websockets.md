
# sample-sync-websockets: Websocket Synchronization

One of the tricks we're going in this project, `sample-sync-websockets`, is trying to get all the clients and server synchronized via websockets. Some challenges arise while trying to accomplish that tasks. 🤔

+ If the server and Decentraland preview server run on different ports how can you communicate *across origin*?
+ What if someone is sending garbage trying to junk up the synchronized state?
+ What if the user or server disconnects or reconnects?

All those are considerations we made while doing this project.

---

We need some tools to get started with this. [socket.io](https://socket.io) is a popular set of modules for this type of thing.

```sh
npm install --save @types/cors @types/express @types/socket.io @types/socket.io-client cors socket.io socket.io-client decentraland-api
```

---

Now a simplified version of the server app to demonstrate communication back and forth from the client and server.

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

So the above shows that we can connect `http`, `express`, and `socket.io` together.

`expressApp.use(cors());` is a key component allowing us to bridge the gap *across origins*. Decentraland preview server runs on one port and our server is running on another port. Without CORS, Cross-Origin Resource Sharing, the browser would not allow these two different processes to speak to one another, even though they are both running on our machine.

---

## Graceful shutdown

You should, where possible, get the server to gracefully shut down so that it doesn't accidentally keep ports open. It will annoy and frustrate you to no end if you don't.

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

If you notice all we have so far is setting up these server objects and handling error cases. The reasoning is that during development, as mere mortals, there could be a lot of errors coming our way. If we don't watch for the errors and report them to the console we might not understand why things aren't working. Because of that we want to handle just about every event we can and give meaningful feedback to the terminal.

It might seem boring or tedious but the mark of a good programmer is someone who can deliver to users an app that works reliably for long periods of time. We want to make the user and our colleagues happy and not give them anything to complain about.

We also benefit by having less awful troubleshooting.

---

## CharacterManager

Of approach we took in this project is called `CharacterManager`.

See `./src/server/lib/character-manager.ts`

It has these methods:

+ `cancelExpiration(id: string)`
+ `scheduleExpiration(id: string)`
+ `characterJoin(joinEvent: ICharacterJoinEvent)`
+ `characterPart(partEvent: ICharacterPartEvent)`
+ `updateCharacterPosition(positionEvent: ICharacterPositionEvent)`
+ `updateCharacterRotation(rotationEvent: ICharacterRotationEvent)`
+ `ping(pingEvent: ICharacterPingEvent)`
+ `characterList()`

What it's trying to do in there is handle each of these user events coming from websockets, validate them, and usually returning a tuple. `[success, error]`

It's going to persist this information into a hash table, an `Object` in JavaScript, and allow us to broadcast that information out to everyone else.

---

## Socket.io Socket events

Now that we've gone over the `CharacterManager` object and what it can do lets create one and wire it up to socket.io.

```ts
const characterManager = new CharacterManager();

socketServer.on("connect", (socket: socketio.Socket) => {
  let characterId: string | undefined;

  console.log("socket.io client connection", socket.id);

  socket.on("error", (err: Errr) => {
    console.error("socket.io socket error", err);
  });

  /**
   * When someone joins we can send them everyone elses name and coordinates.
   */
  const introduceCharacters = throttle(() => {
    characterManager
      .characterList()
      // don't send us... ourselves
      .filter((item) => item.id !== characterId)
      // but send us everyone else
      .forEach((char) => {
        socket.emit("character-join", char);
      });
  }, 1000);

  /**
   * When someone disconnects remove them from the CharacterManager
   * Tell everyone else they disconnected too
   */
  socket.on("disconnect", () => {
    if (characterId !== undefined) {
      const partEvent = { id: characterId };
      characterManager.characterPart(partEvent);
      socketServer.emit("character-part", partEvent);
    }
  });

  /**
   * When someone joins the server lets remember their id and introduce
   * them to all the other users.
   */
  socket.on("character-join", (evt) => {
    const [success, error] = characterManager.characterJoin(evt);

    if (success === true) {
      console.log("character join", evt);
      const { id } = evt;
      characterId = id;
      socket.broadcast.emit("character-join", evt);

      // someone joined so introduce them to everyone else
      introduceCharacters();
      return;
    }

    console.error("character join error", error, evt);
  });

  /**
   * Decentraland has an API to get the coordinates of the user. From
   * their scene they send this coordinate to us. It's then broadcast to
   * everyone who is connected.
   */
  socket.on("character-position", (evt) => {
    const [success, error] = characterManager.updateCharacterPosition(evt);

    if (success === true) {
      console.log("character position", evt);
      socket.broadcast.emit("character-position", evt);
      return;
    }

    console.error("character position error", error, evt);
  });

  /**
   * The same goes for rotation. Decentraland offers a way for people to
   * get their rotation. Their scene sends that to us so we can broadcast
   * to everyone else who is connected.
   */
  socket.on("character-rotation", (evt) => {
    const [success, error] = characterManager.updateCharacterRotation(evt);

    if (success === true) {
      console.log("character rotation", evt);
      socket.broadcast.emit("character-rotation", evt);
      return;
    }

    console.error("character rotation error", error, evt);
  });

  /**
   * Ping allow us to just keep everyone fresh in memory or else their info
   * will get recycled out.
   */
  socket.on("character-ping", (evt) => {
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

## Decentraland scene connects to socket.io

Now that our server is set up to broadcast our coordinates to each other we should send those coordinates to it! It's operating inside a `WebWorker`, not the DOM, so some things are different. For example there is no `window` object.

Decentraland `ScriptableScene` has a few facilities we will use to accomplish connecting to the server and send it our information.

+ `sceneDidMount`
+ `positionChanged`
+ `rotationChanged`

```ts
import * as DCL from "decentraland-api";
import * as io from "socket.io-client";
import { CharacterManager } from "./lib/character-manager";

//
// Again we have this CharacterManager similar to how the server does
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
    // ⚠️ don't automatically connect, explained below
    autoConnect: false,
    // jsonp is impossible in this context (WebWorker)
    jsonp: false,
    // with a specific URI
    path: socketPath,
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
     * Similar to the server example we're just handling all these weird events
     * so that if they occur we get some feedback why it's screwing up.
     */
    socket.on("connect_error", (err) => console.error("socket.io connect_error", err));
    socket.on("connect_timeout", (err) => console.error("socket.io connect_timeout", err));
    socket.on("error", (err) => console.error("socket.io error", err));
    socket.on("reconnect_attempt", () => console.warn("socket.io reconnect_attempt"));
    socket.on("reconnecting", () => console.warn("socket.io reconnecting"));
    socket.on("reconnect_error", (err) => console.error("socket.io reconnect_error", err));
    socket.on("reconnect_failed", (err) => console.error("socket.io reconnect_failed", err));

    /**
     * It might be interesting to see how many times we are reconnecting
     * so this number can be incremented and saved into state.
     */
    socket.on("reconnect", () => {
      let { reconnects } = this.state
      reconnects += 1;
      this.setState({ reconnects });
    });

    // ⚠️ we used the socket.io option `autoConnect: false` because
    // we want to wire up all the events before it connects
    socket.connect()
  }

  public async render () {
    return <scene/>;
  }
}
```

---

## Tracking character events from others

Above we were just concerned with bootstrapping our scene with socket events and basic state. It's ready for any errors that may come up, *for those of us who are just humans that make errors*. Now we can hook up our events tracking data sent from the users. This isn't exactly how we did it in the example app. It's a simplified version printing all the output to the console.

Still inside `sceneDidMount() {}`:

```ts
socket.on("character-join", (evt) => {
  const [success, error] = characterManager.characterJoin(evt);
  console.log("character-join", evt, success, error);
  // what do you want to update in the scene?
});

socket.on("character-part", (evt) => {
  const [success, error] = characterManager.characterPart(evt);
  console.log("character-part", evt, success, error);
  // what do you want to update in the scene?
});

socket.on("character-position", (evt) => {
  const [success, error] = characterManager.characterPosition(evt);
  console.log("character-position", evt, success, error);
  // do you want to react to character movements?
});
socket.on("character-rotation", (evt) => {
  const [success, error] = characterManager.characterRotation(evt);
  console.log("character-rotation", evt, success, error);
  // do you want to react to where players are looking with their viewport?
});
```

---

## Tracking our own movements and sending it

Now we need our own `Character` so we can track where *we* are and send that information out to the server. The server they relays to everyone else.

Still inside `sceneDidMount() {}`:

```ts
// this would be at the top ⤴️
import { Character } from "./lib/character";
const character = new Character();

// this down in sceneDidMount ⤵️

//
// Tracking movements like with W-A-S-D
//
this.subscribeTo("positionChanged", (evt) => {
  const { id } = character;
  const { position } = evt;
  character.position = position;
  socket.emit("character-position", { id, position });
  // update our tiles?
  // update our doors?
  // what ideas do you have for your own movement?
});

//
// Tracking view rotation like mouse-look, phone, or VR view rotate.
//
this.subscribeTo("rotationChanged", (evt) => {
  const { id } = character;
  const { rotation } = evt;
  character.rotation = rotation;
  socket.emit("character-rotation", { id, rotation });
  // now that you've rotated do you want to do anything graphically?
});
```

---

So now we have:

+ The server running HTTP, Websockets, and CORS
+ The Decentraland scene connects to the server
+ The server relays all the data
+ The client sends and receives all the data
+ Both synchronize using `CharacterManager` object

Load up the scene, move around, and look at the developer console in the browser and your server.

[Back to ./readme.md](./readme.md)
