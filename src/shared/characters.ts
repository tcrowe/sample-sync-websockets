/*

+ Character state
+ CharacterManager manages a collection of Character states
+ Functions that validate and manage state for the users.

It's not overkill when you consider how many different ways attackers
will try to use to goof around with servers.

*/

import { Vector3Component } from "decentraland-api";
import { EventEmitter } from "events";
import { Character } from "./character";
import { characterIdleMs } from "./config";
import {
  clampNumber,
  clampVector3,
  isValidId,
  isValidUsername,
  isValidVector3Component,
} from "./formats";

const find = require("lodash/find");
const isNumber = require("lodash/isNumber");

/**
 * Sent and received when new users join the server
 */
export interface ICharacterJoinEvent {
  id: string;
  username: string;
  position: Vector3Component;
  rotation: Vector3Component;
}

/**
 * The user leaves the scenes
 */
export interface ICharacterPartEvent {
  id: string;
}

/**
 * Sent and received user changing their username
 */
export interface ICharacterUsernameEvent {
  id: string;
  username: string;
}

/**
 * Sent and received when a character moves
 */
export interface ICharacterPositionEvent {
  id: string;
  position: Vector3Component;
  cameraPosition: Vector3Component;
  playerHeight: number;
}

/**
 * Sent and recieved when a character rotates
 */
export interface ICharacterRotationEvent {
  id: string;
  rotation: Vector3Component;
}

/**
 * The user lets the apps know it's still there
 */
export interface ICharacterPingEvent {
  id: string;
}

/**
 * Timers are running to clean up memory and remove disconnected users.
 */
interface ICharacterExpiration {
  id: string;
  timer: number | NodeJS.Timer | any;
}

/**
 * Manage some state for all the connected users. It's an isomorphic
 * class being used on clients and the server.
 */
export class CharacterManager extends EventEmitter {
  public characters: Character[] = [];
  public expirationTimers: ICharacterExpiration[] = [];

  /**
   * This object can be used as part of a chain of event emitters
   * so it's helpful to allow other parts of the app to simply
   * emit into this object.
   */
  constructor() {
    super();

    const {
      characterJoin,
      characterPart,
      updateCharacterUsername,
      updateCharacterPosition,
      updateCharacterRotation,
      ping,
    } = this;

    // bind `this` so we keep the instance right
    this.on("character-join", characterJoin.bind(this));
    this.on("character-part", characterPart.bind(this));
    this.on("character-username", updateCharacterUsername.bind(this));
    this.on("character-position", updateCharacterPosition.bind(this));
    this.on("character-rotation", updateCharacterRotation.bind(this));
    this.on("character-ping", ping.bind(this));
  }

  /**
   * Stop a timer that expires a Character
   */
  public cancelExpiration(id: string): void {
    this.expirationTimers = this.expirationTimers.filter(
      (exp: ICharacterExpiration) => {
        if (exp.id === id) {
          clearTimeout(exp.timer);
          return false;
        }

        return true;
      },
    );
  }

  /**
   * Start a timer that will remove a Character
   */
  public scheduleExpiration(id: string): void {
    this.cancelExpiration(id);
    const timer = setTimeout(() => this.characterPart({ id }), characterIdleMs);
    this.expirationTimers.push({ id, timer });
  }

  /**
   * When the characters join we want to validate then add them into the list
   */
  public characterJoin(joinEvent: ICharacterJoinEvent): boolean {
    let { characters } = this;
    const { id, username, rotation } = joinEvent;
    let { position } = joinEvent;
    const existing: Character | undefined = find(characters, { id });

    if (
      isValidId(id) === false &&
      isValidUsername(username) === false &&
      isValidVector3Component(position) === false &&
      isValidVector3Component(rotation) === false
    ) {
      // this isn't really good feedback of what went wrong
      // a possible improvement would be to give a message
      return false;
    }

    position = clampVector3(position);
    this.scheduleExpiration(id);

    if (existing === undefined) {
      const char = new Character();
      char.id = id;
      char.username = username;
      char.position = position;
      char.rotation = rotation;
      characters.push(char);
      this.characters = characters;
      return true;
    }

    characters = characters.map((char) => {
      if (char.id === id) {
        char.username = username;
        char.position = position;
        char.rotation = rotation;
      }

      return char;
    });

    this.characters = characters;
    return true;
  }

  /**
   * Remove a character from the list
   */
  public characterPart(partEvent: ICharacterPartEvent): void {
    const { id } = partEvent;
    this.cancelExpiration(id);
    this.characters = this.characters.filter((char) => char.id !== id);
  }

  /**
   * A user decides to change their randomized name
   */
  public updateCharacterUsername(
    usernameEvent: ICharacterUsernameEvent,
  ): boolean {
    let { characters } = this;
    const { id, username } = usernameEvent;
    const existing = find(characters, { id });

    if (
      isValidId(id) === false ||
      isValidUsername(username) === false ||
      existing === undefined
    ) {
      return false;
    }

    this.scheduleExpiration(id);

    characters = characters.map((char) => {
      if (char.id === id) {
        char.username = username;
      }

      return char;
    });

    this.characters = characters;
    return true;
  }

  /**
   * Handle each user's {x,y,z} movement
   */
  public updateCharacterPosition(
    positionEvent: ICharacterPositionEvent,
  ): boolean {
    let { characters } = this;
    const { id } = positionEvent;
    let { position, cameraPosition, playerHeight } = positionEvent;
    const existing = find(characters, { id });

    if (
      isValidId(id) === false ||
      isValidVector3Component(position) === false ||
      isValidVector3Component(cameraPosition) === false ||
      isNumber(playerHeight) === false ||
      existing === undefined
    ) {
      return false;
    }

    position = clampVector3(position);
    cameraPosition = clampVector3(cameraPosition);
    playerHeight = clampNumber(playerHeight);

    this.scheduleExpiration(id);

    characters = characters.map((char) => {
      if (char.id === id) {
        char.position = position;
        char.cameraPosition = cameraPosition;
        char.playerHeight = playerHeight;
      }

      return char;
    });

    this.characters = characters;
    return true;
  }

  /**
   * Handle the {x,y,z} of where the users are looking
   */
  public updateCharacterRotation(
    rotationEvent: ICharacterRotationEvent,
  ): boolean {
    let { characters } = this;
    const { id, rotation } = rotationEvent;
    const existing = find(characters, { id });

    if (
      isValidId(id) === false ||
      isValidVector3Component(rotation) === false ||
      existing === undefined
    ) {
      return false;
    }

    this.scheduleExpiration(id);

    characters = characters.map((char) => {
      if (char.id === id) {
        char.rotation = rotation;
      }

      return char;
    });

    this.characters = characters;
    return true;
  }

  /**
   * Output an array of the user ID strings
   */
  public ids(): string[] {
    return this.characters.map((char) => char.id);
  }

  /**
   * Refresh the timer that will expire a character.
   */
  public ping(pingEvent: ICharacterPingEvent): void {
    const { id } = pingEvent;

    if (isValidId(id) === false) {
      return;
    }

    this.scheduleExpiration(id);
  }
}
