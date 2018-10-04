/*

Forks:
+ http/websocket worker (cpus - 1)

*/

import * as cluster from "cluster"
import * as os from "os"

/**
 * When a worker errors print it then exit
 */
const workerError = (workerType: string, workerId: number) => (err: Error) => {
  console.log(`worker error`, workerType, workerId, err)
  process.exit(1)
}

if (cluster.isMaster === true) {
  //
  // master process
  //

  // for each cpu run a websocket process
  os.cpus()
    .map(cpu => cluster.fork({ WORKER_TYPE: "ws" }))
    .forEach(wsWorker => wsWorker.on("error", workerError("ws", wsWorker.id)))

  // but only run one preview process
  const previewWorker = cluster.fork({ WORKER_TYPE: "preview" })
  previewWorker.on("error", workerError("preview", previewWorker.id))
}

if (cluster.isMaster === false) {
  //
  // worker process
  //

  const { WORKER_TYPE } = process.env

  if (WORKER_TYPE === "ws") {
    require("./http-ws-worker")
  }

  if (WORKER_TYPE === "preview") {
    require("./dcl-preview-worker")
  }
}
