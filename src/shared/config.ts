/*

shared values by:
+ ./characters.ts
+ ../scene/index.tsx
+ ../server/http-ws-worker.ts

*/

/**
 * Many strings and event keys can use this to keep in sync
 */
const appKey: string = "sample-sync-websockets"

/**
 * The socket.io client uses this specific key rather than /socket.io
 *
 * Maybe this basic trick will fool some nefarious elements trying to
 * mess with it.
 */
const socketPath: string = `/${appKey}`

/**
 * The socket.io client connects to a different port than the preview
 */
const socketPort: string = "8835"

/**
 * The min-max ranges {x,y,z} the players can go and have their actions
 * transmitted.
 */
const boundsMin: number = -10
const boundsMax: number = 10

/**
 * Remember characters for this long when they go idle
 */
const characterIdleMs: number = 60000 // 1min in milliseconds

export { appKey, socketPath, socketPort, boundsMin, boundsMax, characterIdleMs }
