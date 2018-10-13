import * as cluster from "cluster";
import * as cors from "cors";
import * as express from "express";
import * as http from "http";
import * as socketio from "socket.io";
import { CharacterManager } from "../shared/character-manager";
import { socketPath } from "../shared/config";

const throttle = require("lodash/throttle");

const { HTTP_HOST = "127.0.0.1", HTTP_PORT = "8835" } = process.env;
const httpPort: number = parseInt(HTTP_PORT, 10);
const workerId: string = cluster.worker.id.toString();
const expressApp: express.Application = express();
const httpServer: http.Server = http.createServer(expressApp);
const characterManager = new CharacterManager();

// socket.io: receive messages from browser clients
const socketServer: socketio.Server = socketio(httpServer, {
  path: socketPath,
  serveClient: false,
  transports: ["websocket"],
});

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
  let characterId: string | undefined;
  // console.log("socket connection", socket.id);

  socket.on("error", socketError);

  const introduceCharacters = throttle(() => {
    // console.log("introduce", socket.id);
    // when the user joins send them all the characters we know of
    characterManager
      .characterList()
      .filter((item) => item.id !== characterId)
      .forEach((char) => {
        socket.emit("character-join", char);
      });
  }, 1000);

  socket.on(
    "disconnect",
    (): void => {
      if (characterId !== undefined) {
        const partEvent = { id: characterId };
        characterManager.characterPart(partEvent);
        socketServer.emit("character-part", partEvent);
      }
    }
  );

  socket.on(
    "character-join",
    (evt): void => {
      const [success, error] = characterManager.characterJoin(evt);

      if (success === true) {
        // console.log("character join", evt);
        const { id } = evt;
        characterId = id;
        socket.broadcast.emit("character-join", evt);
        introduceCharacters();
        return;
      }

      console.error("character join error", error, evt);
    }
  );

  socket.on(
    "character-username",
    (evt): void => {
      const [success, error] = characterManager.updateCharacterUsername(evt);

      if (success === true) {
        // console.log("character username", evt);
        socket.broadcast.emit("character-username", evt);
        return;
      }

      console.error("character username error", error, evt);
    }
  );

  socket.on(
    "character-position",
    (evt): void => {
      const [success, error] = characterManager.updateCharacterPosition(evt);

      if (success === true) {
        // console.log("character position", evt);
        socket.broadcast.emit("character-position", evt);
        return;
      }

      console.error("character position error", error, evt);
    }
  );

  socket.on(
    "character-rotation",
    (evt): void => {
      const [success, error] = characterManager.updateCharacterRotation(evt);

      if (success === true) {
        // console.log("character rotation", evt);
        socket.broadcast.emit("character-rotation", evt);
        return;
      }

      console.error("character rotation error", error, evt);
    }
  );

  socket.on(
    "character-ping",
    (evt): void => {
      const [success, error] = characterManager.ping(evt);

      if (success === true) {
        // console.log("character ping", evt);
        return;
      }

      console.error("character ping error", error, evt);
    }
  );

  socket.on("introduce", () => introduceCharacters());
}

/**
 * socket.io server error handler
 */
function socketServerError(err: Error): void {
  console.error("socket.io server error", err);
}

//
// http events
//
httpServer.listen(httpPort, HTTP_HOST, httpServerListening);

//
// socket events
//
socketServer.on("connect", socketServerConnection);
socketServer.on("error", socketServerError);

//
// graceful shutdown
//
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
