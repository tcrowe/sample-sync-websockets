/*

Programmatically create a Decentraland preview object and serve the scene
from it. Usually this is done from `dcl start` but that was running at
very high CPU on my system. This doesn't.

*/

import { worker } from "cluster";
import { Decentraland } from "decentraland/dist/lib/Decentraland";
const { PREVIEW_HOST = "127.0.0.1", PREVIEW_PORT = "8834" } = process.env;
const previewPort: number = parseInt(PREVIEW_PORT, 10);
const watch = false;
const dcl = new Decentraland({ previewPort, watch });
const { id } = worker;

function previewReady() {
  console.log("worker", id, `[preview] http://${PREVIEW_HOST}:${PREVIEW_PORT}`);
}

function dclError(err: Error) {
  console.log("worker", id, "dcl error", err);
}

dcl.on("preview:ready", previewReady);
dcl.on("error", dclError);
dcl.preview();
