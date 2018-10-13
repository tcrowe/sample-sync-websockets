/*

This is the scene object which Decentraland pulls into the browser
and displays for the user.

*/

import * as DCL from "decentraland-api";
import { Vector3Component } from "decentraland-api";
import * as io from "socket.io-client";
import { Character } from "../shared/character";
import {
  CharacterManager,
  ICharacterJoinEvent,
  ICharacterPartEvent,
  ICharacterPositionEvent,
  ICharacterRotationEvent,
  ICharacterUsernameEvent,
} from "../shared/character-manager";
import { socketHost, socketPath } from "../shared/config";
import { isValidBoundedVector3Component } from "../shared/formats";

const clamp = require("lodash/clamp");
const padEnd = require("lodash/padEnd");
const throttle = require("lodash/throttle");
const random = require("lodash/random");

export interface IState {
  billboardText: string;
  connected: boolean;
  doorPosition: Vector3Component;
  doorTransition: any; // this wont work as TransitionComponent 🤷‍
  leftWallPosition: Vector3Component;
  reconnects: number;
  rightWallPosition: Vector3Component;
  socketErrors: Error[];
  tileColors: string[];
  tilePositions: Vector3Component[];
  usernameInputText: string;
}

//
// the "ghost" is a placeholder for the other players until there is an
// avatar to show where they are
//

const ghostArc = 170;
const ghostRadius = 0.6;
const ghostScale = { x: 1, y: 0.5, z: 1 };
const ghostColor = "#EFEFEF";

const ghostMaterial = (
  <material
    id="ghost-material"
    alpha={0.3}
    ambientColor={ghostColor}
    albedoColor={ghostColor}
    reflectivityColor={ghostColor}
    hasAlpha={true}
    transparencyMode={2}
  />
);

//
// use the same text for everything
//

const textFontFamily = "monospace";
const textColor = "#FFFFFF";
const textOutlineColor = "#000000";
const textOutlineWidth = 1;

//
// "sign" is like the billboard or other UI in the scene
//

const signColor = "#000510";

const signMaterial = (
  <material
    id="sign-material"
    ambientColor={signColor}
    albedoColor={signColor}
    reflectivityColor={signColor}
    hasAlpha={false}
  />
);

//
// the grid tiles on the ground are 5x5 of 2x2 tiles
//

const gridMin = 0;
const gridMax = 5;

//
// tiles are 2x2 flat boxes on the ground which light up in proximity
// to characters going near it
//

const tileColor = "#222222";
const tileScale: Vector3Component = { x: 2, y: 0.1, z: 2 };
const defaultTilePositions: Vector3Component[] = [];
const defaultTileY = 10;
const defaultTileColors: string[] = [];

const tileTransition = {
  color: {
    duration: 500,
    // timing: "linear",
  },
  position: {
    duration: 700,
    // timing: "ease-out",
  },
};

//
// walls are next to the door near where the player spawns
//

const wallScale = { x: 4, y: 3, z: 0.03 };

const wallMaterial = (
  <material
    id="wall-material"
    alpha={0.99}
    ambientColor={signColor}
    albedoColor={signColor}
    reflectivityColor={signColor}
    hasAlpha={true}
    transparencyMode={2}
  />
);

const wallTransition = {
  position: {
    duration: 1000,
  },
};

//
// the door is in between the walls near where the player spawns
//

const doorMaterial = (
  <material
    id="door-material"
    alpha={0.6}
    ambientColor={signColor}
    albedoColor={signColor}
    reflectivityColor={signColor}
    hasAlpha={true}
    transparencyMode={2}
  />
);

const doorClosedX = 5;
const doorOpenX = 3;
const doorScale = { x: 2.01, y: 3, z: 0.01 };

//
// the "billboard" shows which players are in the scene
//

const billboardBackgroundBox = (
  <box
    id="billboard-bg"
    position={{ x: 4, y: 4, z: 9 }}
    scale={{ x: 4, y: 1.5, z: 0.01 }}
    rotation={{ x: -50, y: 0, z: 0 }}
    material="#sign-material"
  />
);

/**
 * Instantiate the tiles just above the board
 */
for (let a = gridMin; a < gridMax; a += 1) {
  for (let b = gridMin; b < gridMax; b += 1) {
    defaultTilePositions.push({
      x: a * 2 + 1,
      y: defaultTileY,
      z: b * 2 + 1,
    });

    defaultTileColors.push(tileColor);
  }
}

/**
 * Pythagoras' theorem implementation
 *
 * Note: It uses {x,z} not {x,y}. The y-coordinate is how high up it is.
 */
function distance(pos1: Vector3Component, pos2: Vector3Component): number {
  const a = pos1.x - pos2.x;
  const b = pos1.z - pos2.z;
  return Math.sqrt(a * a + b * b);
}

/**
 * Returns true if the character is inside the configured bounds, 0 to 10
 *
 * See ../shared/config.ts
 */
const charInBounds = (char: Character) =>
  isValidBoundedVector3Component(char.position) === true;

//
// CharacterManager holds information about the other characters
//
const characterManager = new CharacterManager();

export default class WebsocketScene extends DCL.ScriptableScene<any, IState> {
  public state: IState = {
    billboardText: "",
    connected: false,
    doorPosition: { x: 5, y: 10, z: 0.5 },
    doorTransition: {
      position: {
        duration: 1000,
      },
    },
    leftWallPosition: { x: 2, y: 10, z: 0.5 },
    reconnects: 0,
    rightWallPosition: { x: 8, y: 10, z: 0.5 },
    socketErrors: [],
    tileColors: defaultTileColors,
    tilePositions: defaultTilePositions,
    usernameInputText: "",
  };

  // representing the viewer of this scene
  private character = new Character();

  // socket.io must uses CORS to connect across origins
  private socket = io(socketHost, {
    autoConnect: false,
    // jsonp is impossible in this context
    jsonp: false,
    // with a specific URI
    path: socketPath,
    // give up after failing too many times
    reconnectionAttempts: 30,
    // only use websockets, not polling
    transports: ["websocket"],
  });

  /**
   * When characters are in proximity to a tile it should light up.
   *
   * It's throttled just in case this is a very heavy computation.
   */
  private generateTileColors = throttle((): void => {
    const { character, state } = this;
    let { tileColors } = state;
    const { tilePositions } = state;
    const charPos = character.position;

    tileColors = tileColors.map((existingColor, index) => {
      const tilePos = tilePositions[index];
      let colorByte = 34;

      // get the distance of the viewing user to the tile
      const characterDistance = distance(charPos, tilePos);

      // calculate all remote users distances
      const otherCharacterDistances: number[] = characterManager
        .characterList()
        .filter(charInBounds)
        .map((otherChar) => distance(otherChar.position, tilePos))
        .filter((num) => num < 2);

      /**
       * The closer the more it should light up. The idea here is to
       * keep incrementing it even if it goes over a valid byte.
       *
       * The result is then clamped to the byte value range we need.
       */
      if (characterDistance < 1) {
        colorByte += 200;
      } else if (characterDistance < 2) {
        colorByte += 100;
      } else if (characterDistance < 3) {
        colorByte += 50;
      }

      otherCharacterDistances.forEach((item) => {
        if (item < 1) {
          colorByte += 200;
        } else if (item < 2) {
          colorByte += 100;
        } else if (item < 3) {
          colorByte += 50;
        }
      });

      // clamp
      colorByte = clamp(colorByte, 34, 255);

      // convert to hex
      const hexByte = colorByte.toString(16);

      // convert to monochrome hex color
      return `#${hexByte}${hexByte}${hexByte}`;
    });

    this.setState({ tileColors });
  }, 100);

  /**
   * Open the door if any players are near it.
   */
  private triggerAutomaticDoor = throttle((): void => {
    const { character, state } = this;
    let { doorPosition } = state;
    const { x, y, z } = doorPosition;
    const isOpen = x === doorOpenX;

    // Q: Why change the activation distance?
    // A: Because the door can be farther away when it's open!
    const activateDistance = isOpen === true ? 4 : 3;

    // get the distance of the viewing user to the tile
    const characterDistance = distance(character.position, doorPosition);

    // calculate all remote users distances
    const otherCharacterDistances: number[] = characterManager
      .characterList()
      .filter(charInBounds)
      .map((otherChar) => distance(otherChar.position, doorPosition))
      .filter((num) => num < activateDistance);

    // is the viewing player close enough?
    // are any network players close enough?
    const closeEnough =
      characterDistance < activateDistance ||
      otherCharacterDistances.length > 0;

    // close it if not closed
    if (closeEnough === false && x !== doorClosedX) {
      doorPosition = {
        x: doorClosedX,
        y,
        z,
      };
      this.setState({ doorPosition });
    }

    // open it if not open
    if (closeEnough === true && x !== doorOpenX) {
      doorPosition = {
        x: doorOpenX,
        y,
        z,
      };
      return this.setState({ doorPosition });
    }
  }, 100);

  /**
   * Sometimes a character sends coordinates but a client doesn't know who
   * they are yet. This will signal it needs to be introduced to whoever
   * is missing from the scene.
   */
  private introduce = throttle(() => {
    // console.log("introduce");
    this.socket.emit("introduce");
  }, 1000);

  /**
   * Set the billboard text, change tile colors, and see if we need to
   * open or close the door. It's throttled so it wont crush the CPU
   * or try to draw too many things into the scene breaking it.
   */
  private eventUpdate = throttle(() => {
    this.generateBillboardText();
    this.generateTileColors();
    this.triggerAutomaticDoor();
  }, 200);

  public sceneDidUnmount(): void {
    this.part();
  }

  /**
   * When the scene loads we use the opportunity to bind socket.io
   * and trigger some animations.
   */
  public sceneDidMount(): void {
    const {
      socket,
      socketConnected,
      socketError,
      socketDisconnected,
      socketReconnect,
      characterJoin,
      characterPart,
      characterUsername,
      characterPosition,
      characterRotation,
      frameworkPositionChanged,
      frameworkRotationChanged,
      character,
    } = this;
    const { id, username } = character;
    const { connected } = socket;
    const usernameInputText = username;

    /*

    Why `.bind(this)` ?

    socket.io doesn't know where it's coming from or that we need
    to have `this` inside each of the event handlers.

    By binding `this` on it we can access state and other
    instance methods inside the event handler.

    */
    socket.on("connect", socketConnected.bind(this));
    socket.on("disconnect", socketDisconnected.bind(this));
    socket.on("connect_error", socketError.bind(this));
    socket.on("connect_timeout", socketError.bind(this));
    socket.on("error", socketError.bind(this));
    socket.on("reconnect", socketReconnect.bind(this));
    socket.on("reconnect_attempt", socketReconnect.bind(this));
    socket.on("reconnecting", socketReconnect.bind(this));
    socket.on("reconnect_error", socketError.bind(this));
    socket.on("reconnect_failed", socketError.bind(this));
    socket.on("character-join", characterJoin.bind(this));
    socket.on("character-part", characterPart.bind(this));
    socket.on("character-username", characterUsername.bind(this));
    socket.on("character-position", characterPosition.bind(this));
    socket.on("character-rotation", characterRotation.bind(this));

    // autoConnect is disabled so we can wire up the events before
    // anything gets sent here
    socket.connect();

    // decentraland framework events
    // this is how we know how to tell the server where we are
    this.subscribeTo("positionChanged", frameworkPositionChanged.bind(this));
    this.subscribeTo("rotationChanged", frameworkRotationChanged.bind(this));

    this.setState({ connected, usernameInputText });

    // We do a keep-alive type action so the server doesn't remove us
    setInterval(() => this.socket.emit("character-ping", { id }), 5000);

    // move the tiles down
    this.transitionTilesDown();

    // move the walls and door down
    setTimeout(() => this.transitionAutomaticDoorDown(), 1000);
  }

  /**
   * Draw the scene.
   *
   * As you can see it's not necessary to draw all the entities
   * from inside the `render` function. They can come from functions.
   */
  public async render() {
    return (
      <scene id="sample-sync-websockets-scene">
        {ghostMaterial}
        {signMaterial}
        {wallMaterial}
        {doorMaterial}
        {billboardBackgroundBox}
        {this.drawUsernameBillboard()}
        {this.drawCharacterBoxes()}
        {this.drawTiles()}
        {this.drawAutomaticDoor()}
      </scene>
    );
  }

  /**
   * When the scene loads it will drop in the door and walls.
   */
  private transitionAutomaticDoorDown(): void {
    const y = wallScale.y / 2;

    // transition left wall down
    setTimeout(() => {
      const { x, z } = this.state.leftWallPosition;
      const leftWallPosition = { x, y, z };
      this.setState({ leftWallPosition });
    }, random(100, 800));

    // transition right wall down
    setTimeout(() => {
      const { x, z } = this.state.rightWallPosition;
      const rightWallPosition = { x, y, z };
      this.setState({ rightWallPosition });
    }, random(100, 800));

    // transition door down
    setTimeout(() => {
      const { x, z } = this.state.doorPosition;
      const doorPosition = { x, y, z };
      this.setState({ doorPosition });
    }, random(100, 800));

    // change door transition speed to be faster after it lands
    setTimeout(() => {
      const doorTransition = {
        position: {
          duration: 100,
        },
      };

      this.setState({ doorTransition });
    }, 2000);
  }

  /**
   * When the scene loads move all the tiles down to the ground.
   */
  private transitionTilesDown(): void {
    // start dropping down the tiles
    // schedule the transition for each tile randomly
    this.state.tilePositions.forEach((position1, index1) => {
      setTimeout(() => {
        let { tilePositions } = this.state;

        // copy the whole array
        tilePositions = tilePositions.map((position2, index2) => {
          if (index1 === index2) {
            // but only modify this one
            const { x, z } = position2;
            const y = 0;
            return { x, y, z };
          }

          return position2;
        });

        // save `tilePositions` triggering the transition
        this.setState({ tilePositions });
      }, random(200, 1000));
    });
  }

  /**
   * The tile positions and color are stored in the state. This will
   * create entities for each tile and draw it into the scene when called.
   */
  private drawTiles(): DCL.ISimplifiedNode[] {
    const { tilePositions, tileColors } = this.state;

    return tilePositions.map((position: Vector3Component, index: number) => (
      <box
        id={`box-${index}`}
        position={position}
        scale={tileScale}
        color={tileColors[index]}
        transition={tileTransition}
      />
    ));
  }

  /**
   * The automatic door opens and closes depending on where other players
   * are moving around in the scene.
   */
  private drawAutomaticDoor(): DCL.ISimplifiedNode[] {
    const {
      leftWallPosition,
      rightWallPosition,
      doorPosition,
      doorTransition,
    } = this.state;

    // the wall to the left when the user spawns
    const leftWall = (
      <box
        id="automatic-door-wall-left"
        material="#wall-material"
        position={leftWallPosition}
        scale={wallScale}
        transition={wallTransition}
      />
    );

    // and to the right
    const rightWall = (
      <box
        id="automatic-door-wall-right"
        material="#wall-material"
        position={rightWallPosition}
        scale={wallScale}
        transition={wallTransition}
      />
    );

    // the door slides open or closed based on state
    // the transition is dynamic as well
    const slidingDoor = (
      <box
        id="automatic-door-sliding-door"
        material="#door-material"
        position={doorPosition}
        scale={doorScale}
        transition={doorTransition}
      />
    );

    return [leftWall, rightWall, slidingDoor];
  }

  /**
   * There is a billboard in the scene. This builds a 3-column text
   * view of all the character names.
   */
  private generateBillboardText(): void {
    const { character } = this;
    const usernames: string[] = characterManager
      .characterList()
      .map((item) => item.username);
    const playerCount = usernames.length + 1;
    let row: string[] = [];
    const { connected, reconnects } = this.state;
    const connectedText = connected === true ? "Connected" : "Disconnected";
    const reconnectsText = `Reconnects: ${reconnects}`;
    const playersText = `Players (${playerCount})`;

    let billboardText = [connectedText, reconnectsText, playersText].join(
      " | "
    );

    billboardText += "\n---------------------------------------";

    // the viewing user is first
    row.push(padEnd(character.username, 20));

    function flush(): void {
      billboardText += "\n" + row.join(" | ");
      row = [];
    }

    /// then everyone else
    usernames.sort();
    usernames.forEach((username) => {
      row.push(padEnd(username, 20));

      if (row.length === 3) {
        flush();
      }
    });

    if (row.length > 0) {
      flush();
    }

    this.setState({ billboardText });
  }

  /**
   * Announce to the server that we're here
   */
  private join(): void {
    // console.log("join");
    const { character } = this;
    const { id, username, position, rotation } = character;
    this.socket.emit("character-join", { id, username, position, rotation });
  }

  /**
   * If possible before closing out the tab send a part message.
   */
  private part(): void {
    const { id } = this.character;
    this.socket.emit("character-part", { id });
  }

  //
  // socket.io events
  //

  private socketConnected(): void {
    // console.log("socket connected");
    this.setState({ connected: true });
    this.join();
  }

  private socketDisconnected(): void {
    // console.error("socket disconnected");
    this.setState({ connected: false });
  }

  private socketError(err: Error): void {
    console.error("socket error", err);
    const { socketErrors } = this.state;
    socketErrors.push(err);
    this.setState({ socketErrors });
  }

  private socketReconnect(): void {
    console.warn("socket reconnect");
    let { reconnects } = this.state;
    reconnects += 1;
    this.setState({ reconnects });
    this.join();
  }

  /**
   * Other characters have joined and will now be rendered in the scene
   */
  private characterJoin(joinEvent: ICharacterJoinEvent): void {
    const [success, error] = characterManager.characterJoin(joinEvent);

    if (success === true) {
      this.eventUpdate();
      return;
    }

    console.error("character join error", error);
    this.introduce();
  }

  private characterPart(partEvent: ICharacterPartEvent): void {
    const [success, error] = characterManager.characterPart(partEvent);

    if (success === true) {
      this.eventUpdate();
      return;
    }

    console.error("character part error", error);
    this.introduce();
  }

  /**
   * A character changed their username
   *
   * It's disabled until we figure out how to use textboxes
   */
  private characterUsername(usernameEvent: ICharacterUsernameEvent): void {
    const [success, error] = characterManager.updateCharacterUsername(
      usernameEvent
    );

    if (success === true) {
      this.eventUpdate();
      return;
    }

    console.error("character username error", error);
    this.introduce();
  }

  /**
   * This event is triggered when other users move around their scene. Their
   * position gets broadcast to everyone.
   */
  private characterPosition(positionEvent: ICharacterPositionEvent): void {
    const [success, error] = characterManager.updateCharacterPosition(
      positionEvent
    );

    if (success === true) {
      this.eventUpdate();
      return;
    }

    console.error("character position error", error);
    this.introduce();
  }

  /**
   * The rotation is broadcast any time they swivel around their camera.
   */
  private characterRotation(rotationEvent: ICharacterRotationEvent): void {
    const [success, error] = characterManager.updateCharacterRotation(
      rotationEvent
    );

    if (success === true) {
      this.eventUpdate();
      return;
    }

    console.error("character rotation error", error);
    this.introduce();
  }

  /**
   * This is a Decentraland event triggered when the user moves. It's broadcast
   * to the server so everyone can see.
   */
  private frameworkPositionChanged(evt: DCL.IEvents["positionChanged"]): void {
    const { socket, character } = this;
    const { id } = character;
    const { position } = evt;
    socket.emit("character-position", { id, position });
    this.character.position = position;
    this.eventUpdate();
  }

  /**
   * When the user rotates around the view it will be broadcast. This
   * allows us to see where they are looking.
   */
  private frameworkRotationChanged(evt: DCL.IEvents["rotationChanged"]): void {
    const { socket, character } = this;
    const { id } = character;
    const { rotation } = evt;
    socket.emit("character-rotation", { id, rotation });
  }

  /**
   * Draw a billboard with all the user's name on it. It's tilted down
   * so they can see it from below.
   */
  private drawUsernameBillboard(): DCL.ISimplifiedNode {
    return (
      <text
        id="billboard-text"
        position={{ x: 4, y: 3.95, z: 9 }}
        rotation={{ x: -50, y: 0, z: 0 }}
        outlineWidth={textOutlineWidth}
        outlineColor={textOutlineColor}
        color={textColor}
        fontFamily={textFontFamily}
        fontSize={48}
        value={this.state.billboardText}
        lineSpacing="1.3"
        textWrapping={false}
        hAlign="left"
        vAlign="top"
        width={3.73}
        height={1.36}
        resizeToFit={false}
        shadowBlur={1}
        shadowOffsetX={1}
        shadowOffsetY={1}
        shadowColor={textOutlineColor}
      />
    );
  }

  /**
   * Draw ghost placeholders for all the characters so we can see them in
   * realtime moving around and rotating.
   */
  private drawCharacterBoxes(): DCL.ISimplifiedNode[][] {
    return characterManager
      .characterList()
      .filter(charInBounds)
      .map((char, index) => {
        const { username, position, rotation } = char;
        const charBoxId = `character-box-${index}`;

        const { x, z } = position;
        const ghostPosition = { x, y: 1.5, z };
        const nametagPosition = { x, y: 2.3, z };
        const nametagRotation = {
          x: rotation.x,
          y: rotation.y + 180,
          z: rotation.z,
        };

        // user ghost box
        const ghost = (
          <cylinder
            id={charBoxId}
            key={charBoxId}
            position={ghostPosition}
            rotation={rotation}
            scale={ghostScale}
            arc={ghostArc}
            radius={ghostRadius}
            openEnded={true}
            material="#ghost-material"
          />
        );

        // user name tag
        const nametag = (
          <text
            position={nametagPosition}
            rotation={nametagRotation}
            outlineWidth={textOutlineWidth}
            outlineColor={textOutlineColor}
            color={textColor}
            fontFamily={textFontFamily}
            fontSize={70}
            value={username}
            width={2}
            height={0.6}
          />
        );

        return [ghost, nametag];
      });
  }
}
