/*

Forks:
+ http/websocket worker (cpus - 1)

*/

import * as cluster from "cluster";
import * as os from "os";

if (cluster.isMaster === true) {
  //
  // master process
  //

  // for each cpu run a websocket process
  os.cpus().forEach((cpu) => cluster.fork({ WORKER_TYPE: "ws" }));

  // but only run one preview process
  cluster.fork({ WORKER_TYPE: "preview" });
}

if (cluster.isMaster === false) {
  //
  // worker process
  //

  const { WORKER_TYPE } = process.env;

  if (WORKER_TYPE === "ws") {
    require("./http-ws-worker");
  }

  if (WORKER_TYPE === "preview") {
    require("./dcl-preview-worker");
  }
}
