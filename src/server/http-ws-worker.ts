import * as cluster from "cluster";
import * as cors from "cors";
import * as express from "express";
import * as http from "http";
import * as redis from "redis";
import * as socketio from "socket.io";
import { appKey, socketPath } from "../shared/config";

import {
  CharacterManager,
  ICharacterJoinEvent,
  ICharacterPartEvent,
  ICharacterPingEvent,
  ICharacterPositionEvent,
  ICharacterRotationEvent,
  ICharacterUsernameEvent,
} from "../shared/characters";

/**
 * Generic description of all the messages we're sending around
 */
interface IBroadcastEvent {
  evtName: string;
  evt:
    | ICharacterJoinEvent
    | ICharacterPartEvent
    | ICharacterUsernameEvent
    | ICharacterPositionEvent
    | ICharacterRotationEvent
    | ICharacterPingEvent;
}

/**
 * The same as broadcast but with a worker id
 */
interface IWorkerBroadcastEvent extends IBroadcastEvent {
  workerId: string;
}

const {
  HTTP_HOST = "127.0.0.1",
  HTTP_PORT = "8835",
  REDIS_HOST = "127.0.0.1",
  REDIS_PORT = "6379",
} = process.env;

const httpPort: number = parseInt(HTTP_PORT, 10);
const redisPort: number = parseInt(REDIS_PORT, 10);
const workerId: string = cluster.worker.id.toString();
const expressApp: express.Application = express();
const httpServer: http.Server = http.createServer(expressApp);
const characterManager = new CharacterManager();

// pub: send to the other nodes
const pub = redis.createClient({
  host: REDIS_HOST,
  port: redisPort,
});

// sub: receive messages from the other nodes
const sub = redis.createClient({
  host: REDIS_HOST,
  port: redisPort,
});

// socket.io: receive messages from browser clients
const socketServer: socketio.Server = socketio(httpServer, {
  path: socketPath,
  serveClient: false,
  transports: ["websocket"],
});

// watch for these events from the client and other nodes
const socketEvents = [
  "character-join",
  "character-username",
  "character-position",
  "character-rotation",
  "character-ping",
];

// we're communicating across different ports(origin) from the preview
expressApp.use(cors());

/**
 * Try to gracefully shutdown the server passing an exit code to the shell
 */
function shutdown(code: number = 0): void {
  let exitCode: number = code;

  try {
    socketServer.close();
  } catch (e) {
    console.error("error closing socket.io", e);
    exitCode = 1;
  }

  try {
    httpServer.close();
  } catch (e) {
    console.error("error closing http server", e);
    exitCode = 1;
  }

  try {
    pub.quit();
  } catch (e) {
    console.error("error closing redis pub", e);
    exitCode = 1;
  }

  try {
    sub.quit();
  } catch (e) {
    console.error("error closing redis sub", e);
    exitCode = 1;
  }

  process.exit(exitCode);
}

/**
 * Fired when the http server is listening
 */
function httpServerListening(err?: Error): void {
  if (err !== undefined && err !== null) {
    console.error("error binding http server", HTTP_HOST, HTTP_PORT, err);
    return shutdown(1);
  }

  console.log("worker", workerId, `[ws] http://${HTTP_HOST}:${HTTP_PORT}`);
}

/**
 * Event handler for the individual socket error
 */
const socketError = (err: Error): void => console.error("socket error", err);

/**
 * Each time a user connects it needs to relay all the messages around
 */
function socketServerConnection(socket: socketio.Socket): void {
  console.log("socket connection");

  socket.on("error", socketError);

  // bind all the events
  socketEvents.forEach((evtName) => {
    // when a message comes in broadcast and persist state in memory
    socket.on(evtName, (evt) => {
      socketServer.emit(evtName, evt);
      characterManager.emit(evtName, evt);
      pub.publish(appKey, JSON.stringify({ workerId, evtName, evt }));
    });
  });

  // when the user joins send them all the characters we know of
  characterManager.characters.forEach((char) =>
    socket.emit("character-join", char),
  );
}

/**
 * socket.io server error handler
 */
function socketServerError(err: Error): void {
  console.error("socket.io server error", err);
}

/**
 * Event handler for when subscribed messages arrive on this process
 */
function subMessage(channel: string, msg: string): void {
  let workerMessage: IWorkerBroadcastEvent;

  try {
    workerMessage = JSON.parse(msg);
  } catch (err) {
    return console.error("error parsing worker message", err);
  }

  if (workerMessage.workerId === workerId) {
    return; /* console.log("skipped same proccess msg", workerId)*/
  }

  const { evtName, evt } = workerMessage;

  socketServer.emit(evtName, evt);
  characterManager.emit(evtName, evt);
}

//
// http events
//
httpServer.listen(httpPort, HTTP_HOST, httpServerListening);

//
// socket events
//
socketServer.on("connection", socketServerConnection);
socketServer.on("error", socketServerError);

//
// redis publisher events
//
pub.on("error", (err) => console.error("pub error", err));

//
// redis subcriber events
//
sub.subscribe(appKey);
sub.on("error", (err) => console.error("sub error", err));
sub.on("message", subMessage);

//
// graceful shutdown
//
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
