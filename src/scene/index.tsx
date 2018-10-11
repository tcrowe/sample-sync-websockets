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
} from "../shared/characters";
import { socketPath, socketPort } from "../shared/config";
import { clampNumber, clampVector3 } from "../shared/formats";

const isObject = require("lodash/isObject");
const padEnd = require("lodash/padEnd");
const clamp = require("lodash/clamp");
const throttle = require("lodash/throttle");

/**
 * The tiles are all 2x2 spaces
 */
const tileScale: Vector3Component = { x: 2, y: 0.1, z: 2 };
const defaultTileColor = "#222222";

const ghostArc = 170;
const ghostRadius = 0.6;
const ghostScale = { x: 1, y: 0.5, z: 1 };

const textFontFamily = "monospace";
const textColor = "#FFFFFF";
const textOutlineColor = "#000000";
const textOutlineWidth = 1;

const gridMin = 0;
const gridMax = 5;

const signColor = "#001133";

const initTilePositions: Vector3Component[] = [];
const initTileColors: string[] = [];
const initTileYs: number[] = [];

const ghostMaterial = (
  <material
    id="ghost-material"
    alpha={0.2}
    ambientColor="#EFEFEF"
    albedoColor="#EFEFEF"
    reflectivityColor="#EFEFEF"
    hasAlpha={true}
    transparencyMode={2}
  />
);

const signMaterial = (
  <material
    id="sign-material"
    albedoColor={signColor}
    reflectivityColor={signColor}
  />
);

const billboardBackgroundBox = (
  <box
    id="billboard-bg"
    position={{ x: 4, y: 4, z: 9 }}
    scale={{ x: 4, y: 1.5, z: 0.01 }}
    rotation={{ x: -50, y: 0, z: 0 }}
    material="#sign-material"
  />
);

const usernameEditorBackgroundBox = (
  <box
    id="username-editor-background"
    position={{ x: 4, y: 1.5, z: 9.8 }}
    scale={{ x: 2, y: 1, z: 0.01 }}
    material="#sign-material"
  />
);

const usernameEditorLabel = (
  <text
    id="billboard-text"
    position={{ x: 4, y: 1.8, z: 9.75 }}
    outlineWidth={textOutlineWidth}
    outlineColor={textOutlineColor}
    color={textColor}
    fontFamily={textFontFamily}
    fontSize={48}
    value="Change username"
    shadowBlur={3}
    shadowOffsetX={3}
    shadowOffsetY={3}
    shadowColor={textOutlineColor}
  />
);

interface IState {
  connected: boolean;
  socketErrors: Error[];
  reconnects: number;
  tileYs: number[];
  tileColors: string[];
  usernameInputText: string;
  billboardText: string;
}

// the socket.io client connects somewhere else than where this scene is
// it's configurable within ../shared/config.ts
const { origin } = location;
const socketHost: string = origin.replace(/\d{1,}$/, socketPort);

for (let a = gridMin; a < gridMax; a += 1) {
  for (let b = gridMin; b < gridMax; b += 1) {
    const position: Vector3Component = {
      x: a * 2 + 1,
      y: 1,
      z: b * 2 + 1,
    };
    initTilePositions.push(position);
    initTileColors.push(defaultTileColor);
    initTileYs.push(1);
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

export default class WebsocketScene extends DCL.ScriptableScene<any, IState> {
  /*
  I tried putting complex objects into this state representing objects
  with all the character's data. It was unable to update. Instead only
  simple types are in the IState object. More complex ones are outside it.
  -Tony
  */
  public state: IState = {
    billboardText: "",
    connected: false,
    reconnects: 0,
    socketErrors: [],
    tileColors: initTileColors,
    tileYs: initTileYs,
    usernameInputText: "",
  };

  // representing the viewer of this scene
  public character = new Character();

  // other players around the network
  public characterManager = new CharacterManager();

  // socket.io must uses CORS to connect across origins
  // this object connects on a different port
  public socket = io(socketHost, {
    jsonp: false, // jsonp is impossible in this context
    path: socketPath, // with a specific URI
    reconnectionAttempts: 30, // give up after failing too many times
    transports: ["websocket"], // only use websockets, not polling
  });

  /**
   * When characters are in proximity to a tile it should light up.
   *
   * It's throttled just in case this is a very heavy computation.
   */
  public generateTileColors = throttle((): void => {
    const { character, characterManager } = this;
    const { characters } = characterManager;
    const tileColors: string[] = [];
    const charPos = character.position;

    initTilePositions.forEach((tilePos: Vector3Component) => {
      let colorByte = 34;

      // get the distance of the viewing user to the tile
      const characterDistance = distance(charPos, tilePos);

      // calculate all remote users distances
      const otherCharacterDistances: number[] = characters
        .map((char) => distance(char.position, tilePos))
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

      // convert to hex color
      const color = `#${hexByte}${hexByte}${hexByte}`;

      tileColors.push(color);
    });

    this.setState({ tileColors });
  }, 100);

  /**
   * There is a billboard in the scene. This builds a 3-column text
   * view of all the character names.
   */
  public generateBillboardText(): void {
    const { character, characterManager } = this;
    const { characters } = characterManager;
    const usernames: string[] = characters.map((item) => item.username);
    const playerCount = usernames.length + 1;
    let row: string[] = [];
    let billboardText = `players (${playerCount}):\n-------`;

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
  public join(): void {
    // console.log("join")
    const { character } = this;
    const { id, username, position, rotation } = character;
    this.socket.emit("character-join", { id, username, position, rotation });
  }

  /**
   * Leave the scene
   */
  public part(): void {
    const { id } = this.character;
    this.socket.emit("character-part", { id });
  }

  //
  // socket.io events
  //

  public socketConnected(): void {
    // console.log("socket connected")
    this.setState({ connected: true });
    this.join();
  }

  public socketDisconnected(): void {
    // console.error("socket disconnected")
    this.setState({ connected: false });
  }

  public socketError(err: Error): void {
    console.error("socket error", err);
    const { socketErrors } = this.state;
    socketErrors.push(err);
    this.setState({ socketErrors });
  }

  public socketReconnect(): void {
    console.warn("socket reconnect");
    let { reconnects } = this.state;
    reconnects += 1;
    this.setState({ reconnects });
    this.join();
  }

  /**
   * Other characters have joined and will now be rendered in the scene
   */
  public characterJoin(joinEvent: ICharacterJoinEvent): void {
    if (isObject(joinEvent) === true && joinEvent.id === this.character.id) {
      // skip this event if the character is the viewer
      return;
    }

    const { characterManager } = this;
    characterManager.characterJoin(joinEvent);
    this.forceUpdate();
    this.generateBillboardText();
  }

  public characterPart(partEvent: ICharacterPartEvent): void {
    this.characterManager.characterPart(partEvent);
    this.forceUpdate();
    this.generateBillboardText();
  }

  /**
   * A character changed their username
   */
  public characterUsername(usernameEvent: ICharacterUsernameEvent): void {
    if (
      isObject(usernameEvent) === true &&
      usernameEvent.id === this.character.id
    ) {
      // skip this event if the character is the viewer
      return;
    }

    const { characterManager } = this;
    characterManager.updateCharacterUsername(usernameEvent);
    this.forceUpdate();
    this.generateBillboardText();
  }

  /**
   * This event is triggered when other users move around their scene. Their
   * position gets broadcast to everyone.
   */
  public characterPosition(positionEvent: ICharacterPositionEvent): void {
    if (
      isObject(positionEvent) === true &&
      positionEvent.id === this.character.id
    ) {
      // skip this event if the character is the viewer
      return;
    }

    this.characterManager.updateCharacterPosition(positionEvent);
    this.forceUpdate();
  }

  /**
   * The rotation is broadcast any time they swivel around their camera.
   */
  public characterRotation(rotationEvent: ICharacterRotationEvent): void {
    if (
      isObject(rotationEvent) === true &&
      rotationEvent.id === this.character.id
    ) {
      // skip this event if the character is the viewer
      return;
    }

    this.characterManager.updateCharacterRotation(rotationEvent);
    this.forceUpdate();
    this.generateTileColors();
  }

  /**
   * This is a Decentraland event triggered when the user moves. It's broadcast
   * to the server so everyone can see.
   */
  public frameworkPositionChanged(evt: DCL.IEvents["positionChanged"]): void {
    const { socket, character } = this;
    const { id } = character;
    let { position, cameraPosition, playerHeight } = evt;

    position = clampVector3(position);
    cameraPosition = clampVector3(cameraPosition);
    playerHeight = clampNumber(playerHeight);

    socket.emit("character-position", {
      cameraPosition,
      id,
      playerHeight,
      position,
    });

    this.character.position = position;
    this.generateTileColors();
  }

  /**
   * When the user rotates around the view it will be broadcast. This
   * allows us to see where they are looking.
   */
  public frameworkRotationChanged(evt: DCL.IEvents["rotationChanged"]): void {
    const { socket, character } = this;
    const { id } = character;
    const { rotation } = evt;
    socket.emit("character-rotation", { id, rotation });
  }

  /**
   * Draw a billboard with all the user's name on it. It's tilted down
   * so they can see it from below.
   */
  public playersBillboard(): DCL.ISimplifiedNode {
    const { billboardText } = this.state;

    return (
      <text
        id="billboard-text"
        position={{ x: 4.1, y: 3.8, z: 9.1 }}
        rotation={{ x: -50, y: 0, z: 0 }}
        outlineWidth={textOutlineWidth}
        outlineColor={textOutlineColor}
        color={textColor}
        fontFamily={textFontFamily}
        fontSize={48}
        value={billboardText}
        lineSpacing="1.3"
        textWrapping={false}
        hAlign="left"
        vAlign="top"
        width={4}
        height={1.5}
        shadowBlur={3}
        shadowOffsetX={3}
        shadowOffsetY={3}
        shadowColor={textOutlineColor}
      />
    );
  }

  /**
   * Draw ghost placeholders for all the characters so we can see them in
   * realtime moving around and rotating.
   */
  public characterBoxes(): DCL.ISimplifiedNode[][] {
    return this.characterManager.characters.map((char, index) => {
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

  /**
   * When the scene loads up we give a clue about the interactive floor tiles
   * by animating each one down in a fast animation sequence.
   */
  public transitionTileDown(tileIndex: number): void {
    const { tileYs } = this.state;
    let y = tileYs[tileIndex];

    if (y <= 0) {
      // it's already at the ground level, early exit, stop animating this tile
      return;
    }

    // move the tile down
    y -= 0.1;

    // because javascript does incorrect math we have to force
    // only one decimal point
    y = parseFloat(y.toFixed(1));

    // set the y of this tile
    tileYs[tileIndex] = y;

    // animate
    this.setState({ tileYs });

    // schedule another animation
    setTimeout(() => this.transitionTileDown(tileIndex), 30);
  }

  /**
   * Draw the tiles 5x5 grid of 2x2 size
   *
   * This was actually a difficult one to solve. If I used Vector3Components
   * from the state object it didn't work. Maybe there is a limitation
   * or some clever code in the framework trying to reduce CPU use
   * by intelligently detecting state change. Either way this hack worked.
   *
   * Some variables are inside the state and some are outside.
   *
   * -Tony
   */
  public tiles(): DCL.ISimplifiedNode[] {
    const { tileYs, tileColors } = this.state;

    return tileYs.map((y, index) => {
      const { x, z } = initTilePositions[index];
      const color = tileColors[index];

      return (
        <box
          id={`tile-${index}`}
          position={{ x, y, z }}
          scale={tileScale}
          color={color}
        />
      );
    });
  }

  /**
   * Draw some boxes that allow the user to go change their username.
   */
  public usernameEditor(): DCL.ISimplifiedNode[] {
    const { usernameInputText } = this.state;

    // let change = (evt: any) => console.log("evt", evt)
    const save = () => this.setState({ usernameInputText });

    // no onChange ☹️
    const textbox = (
      <input-text
        position={{ x: 4, y: 1.5, z: 9.75 }}
        color="#000000"
        fontFamily={textFontFamily}
        fontSize={40}
        value={usernameInputText}
        height={0.5}
        background="#EEEEEE"
        focusedBackground="#FFFFFF"
      />
    );

    const btn = (
      <box
        id="username-editor-btn"
        position={{ x: 4.7, y: 1.2, z: 9.75 }}
        scale={{ x: 0.3, y: 0.3, z: 0.01 }}
        color={signColor}
        onClick={save}
      />
    );

    const btnText = (
      <text
        id="billboard-text"
        position={{ x: 4.7, y: 1.2, z: 9.7 }}
        outlineWidth={textOutlineWidth}
        outlineColor={textOutlineColor}
        color={textColor}
        fontFamily={textFontFamily}
        fontSize={48}
        value="OK"
        shadowBlur={3}
        shadowOffsetX={3}
        shadowOffsetY={3}
        shadowColor={textOutlineColor}
        onClick={save}
      />
    );

    return [textbox, btn, btnText];
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
      characterUsername,
      characterPosition,
      characterRotation,
      frameworkPositionChanged,
      frameworkRotationChanged,
      character,
    } = this;
    const { id, username } = character;
    const { connected } = socket;
    let transitionDelay = 100;
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
    socket.on("timeout", socketError.bind(this));
    socket.on("error", socketError.bind(this));
    socket.on("reconnect", socketReconnect.bind(this));
    socket.on("character-join", characterJoin.bind(this));
    socket.on("character-username", characterUsername.bind(this));
    socket.on("character-position", characterPosition.bind(this));
    socket.on("character-rotation", characterRotation.bind(this));

    // framework events
    this.subscribeTo("positionChanged", frameworkPositionChanged.bind(this));
    this.subscribeTo("rotationChanged", frameworkRotationChanged.bind(this));

    this.setState({ connected, usernameInputText });

    // schedule animations for each tile
    this.state.tileYs.forEach((_, tileIndex) => {
      setTimeout(() => this.transitionTileDown(tileIndex), transitionDelay);
      transitionDelay += 50;
    });

    // keep-alive type thing
    setInterval(() => this.socket.emit("character-ping", { id }), 5000);

    this.generateBillboardText();
  }

  public sceneWillUnmount(): void {
    this.part();
  }

  /**
   * Draw the scene.
   *
   * As you can see it's not necessary to draw all the entities
   * from inside the `render` function. They can be anywhere.
   */
  public async render() {
    return (
      <scene id="sample-sync-websockets-scene">
        {ghostMaterial}
        {signMaterial}
        {billboardBackgroundBox}
        {usernameEditorBackgroundBox}
        {usernameEditorLabel}
        {this.playersBillboard()}
        {this.characterBoxes()}
        {this.tiles()}
        {this.usernameEditor()}
      </scene>
    );
  }
}
