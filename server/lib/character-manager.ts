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
import { isValidId, isValidUsername, isValidVector3Component } from "./formats";

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

export type OptionalError = Error | undefined;
export type EventResultTuple = [boolean, OptionalError];

export interface ITimerHashTable {
  [key: string]: number | NodeJS.Timer | any;
}

export interface ICharacterHashTable {
  [key: string]: Character;
}

const characterDoesNotExistError = new Error("the character doesn't exist");

/**
 * Manage some state for all the connected users. It's an isomorphic
 * class being used on clients and the server.
 */
export class CharacterManager extends EventEmitter {
  public characters: ICharacterHashTable = {};
  public expirationTimers: ITimerHashTable = {};

  /**
   * Stop a timer that expires a Character
   */
  public cancelExpiration(id: string): void {
    if (this.expirationTimers[id] === undefined) {
      return;
    }
    clearTimeout(this.expirationTimers[id]);
    delete this.expirationTimers[id];
  }

  /**
   * Start a timer that will remove a Character
   */
  public scheduleExpiration(id: string): void {
    if (this.characters[id] === undefined) {
      return;
    }

    this.cancelExpiration(id);
    const timer = setTimeout(() => this.characterPart({ id }), characterIdleMs);
    this.expirationTimers[id] = timer;
  }

  public validationError(field: string): Error {
    return new Error(`CharacterManager: event validation error → ${field}`);
  }

  /**
   * When the characters join we want to validate then add them into the list
   */
  public characterJoin(joinEvent: ICharacterJoinEvent): EventResultTuple {
    const { characters } = this;
    const { id, username, rotation } = joinEvent;
    const { position } = joinEvent;

    if (isValidId(id) === false) {
      return [false, this.validationError("id")];
    }

    if (isValidUsername(username) === false) {
      return [false, this.validationError("username")];
    }

    if (isValidVector3Component(position) === false) {
      return [false, this.validationError("position")];
    }

    if (isValidVector3Component(rotation) === false) {
      return [false, this.validationError("rotation")];
    }

    this.scheduleExpiration(id);

    const char = characters[id] || new Character();
    char.id = id;
    char.username = username;
    char.position = position;
    char.rotation = rotation;
    this.characters[id] = char;
    return [true, undefined];
  }

  /**
   * Remove a character from the list
   */
  public characterPart(partEvent: ICharacterPartEvent): EventResultTuple {
    const { id } = partEvent;
    this.cancelExpiration(id);
    delete this.characters[id];
    return [true, undefined];
  }

  /**
   * A user decides to change their randomized name
   */
  public updateCharacterUsername(
    usernameEvent: ICharacterUsernameEvent
  ): EventResultTuple {
    const { characters } = this;
    const { id, username } = usernameEvent;

    if (isValidId(id) === false) {
      return [false, this.validationError("id")];
    }

    if (isValidUsername(username) === false) {
      return [false, this.validationError("username")];
    }

    if (characters[id] === undefined) {
      return [false, characterDoesNotExistError];
    }

    this.scheduleExpiration(id);
    this.characters[id].username = username;

    return [true, undefined];
  }

  /**
   * Handle each user's {x,y,z} movement
   */
  public updateCharacterPosition(
    positionEvent: ICharacterPositionEvent
  ): EventResultTuple {
    const { characters } = this;
    const { id } = positionEvent;
    const { position } = positionEvent;

    if (isValidId(id) === false) {
      return [false, this.validationError("id")];
    }

    if (isValidVector3Component(position) === false) {
      return [false, this.validationError("position")];
    }

    if (characters[id] === undefined) {
      return [false, characterDoesNotExistError];
    }

    this.scheduleExpiration(id);
    this.characters[id].position = position;

    return [true, undefined];
  }

  /**
   * Handle the {x,y,z} of where the users are looking
   */
  public updateCharacterRotation(
    rotationEvent: ICharacterRotationEvent
  ): EventResultTuple {
    const { characters } = this;
    const { id, rotation } = rotationEvent;

    if (isValidId(id) === false) {
      return [false, this.validationError("id")];
    }

    if (isValidVector3Component(rotation) === false) {
      return [false, this.validationError("rotation")];
    }

    if (characters[id] === undefined) {
      return [false, characterDoesNotExistError];
    }

    this.scheduleExpiration(id);
    this.characters[id].rotation = rotation;
    return [true, undefined];
  }

  /**
   * Refresh the timer that will expire a character.
   */
  public ping(pingEvent: ICharacterPingEvent): EventResultTuple {
    const { id } = pingEvent;

    if (isValidId(id) === false) {
      return [false, this.validationError("id")];
    }

    if (this.characters[id] === undefined) {
      return [false, characterDoesNotExistError];
    }

    this.scheduleExpiration(id);

    return [true, undefined];
  }

  public characterList(): Character[] {
    const { characters } = this;
    return Object.keys(characters).map((key) => characters[key]);
  }
}
