/*

+ Character state
+ CharacterManager manages a collection of Character states
+ Functions that validate and manage state for the users.

It's not overkill when you consider how many different ways attackers
will try to use to goof around with servers.

*/

import { Vector3Component } from "decentraland-api"
import { boundsMin, boundsMax, characterIdleMs } from "../shared/config"
import { EventEmitter } from "events"

const find = require("lodash/find")
const isNumber = require("lodash/isNumber")
const isFinite = require("lodash/isFinite")
const clamp = require("lodash/clamp")

const validIdPattern = /^character-\d{5,20}$/
const validUsernamePattern = /^[0-9a-zA-Z\-\_\.\ ]{3,20}$/

/**
 * Generate a random id for the character
 * @returns {string}
 */
export const randomId = function(): string {
  const randPart: string = Math.random()
    .toString()
    .substring(2, 8)
  return `character-${randPart}`
}

/**
 * True if valid id
 */
export const isValidId = (id?: string): boolean =>
  id !== undefined && id !== null && validIdPattern.test(id) === true

/**
 * Check if the user input is a valid username
 */
export const isValidUsername = (username?: string): boolean =>
  username !== undefined &&
  username !== null &&
  validUsernamePattern.test(username) === true

/**
 * An actual JS number excluding NaN and Intinity
 */
export const isValidNumber = (num?: number | string) =>
  num !== undefined &&
  num !== null &&
  // numeric
  isNumber(num) === true &&
  // not infinity, not NaN
  isFinite(num) === true

/**
 * True when the value is a number within our configured bounds
 */
export const isValidBoundedNumber = (num?: number | string): boolean =>
  // the number is valid
  num !== undefined &&
  num !== null &&
  isValidNumber(num) === true &&
  // and it's within our square
  num >= boundsMin &&
  num <= boundsMax

/**
 * Returns true if the Vector3Component has valid coordinates
 */
export function isValidVector3Component(v3?: Vector3Component): boolean {
  if (v3 === undefined || v3 === null) {
    return false
  }

  const { x, y, z } = v3
  return [x, y, z].every(num => isValidNumber(num)) === true
}

/**
 * Clamp a number to the configured bounds
 */
export const clampNumber = (num: number): number =>
  clamp(num, boundsMin, boundsMax)

/**
 * Limit the {x,y,z} of a Vector3Component object to the configured bounds
 */
export const clampVector3 = (v3: Vector3Component): Vector3Component => ({
  x: clampNumber(v3.x),
  y: clampNumber(v3.y),
  z: clampNumber(v3.z)
})

/**
 * Sent and received when new users join the server
 */
export interface ICharacterJoinEvent {
  id: string
  username: string
  position: Vector3Component
  rotation: Vector3Component
}

/**
 * The user leaves the scenes
 */
export interface ICharacterPartEvent {
  id: string
}

/**
 * Sent and received user changing their username
 */
export interface ICharacterUsernameEvent {
  id: string
  username: string
}

/**
 * Sent and received when a character moves
 */
export interface ICharacterPositionEvent {
  id: string
  position: Vector3Component
  cameraPosition: Vector3Component
  playerHeight: number
}

/**
 * Sent and recieved when a character rotates
 */
export interface ICharacterRotationEvent {
  id: string
  rotation: Vector3Component
}

/**
 * The user lets the apps know it's still there
 */
export interface ICharacterPingEvent {
  id: string
}

/**
 * Timers are running to clean up memory and remove disconnected users.
 */
interface ICharacterExpiration {
  id: string
  timer: number | NodeJS.Timer | WindowTimers | any
}

/**
 * Representing a user in the scene. It is used both for
 * the user viewing as well as all the network users.
 */
export class Character {
  id: string = randomId()
  username: string = ""
  playerHeight: number = 0

  position: Vector3Component = {
    x: 0,
    y: 0,
    z: 0
  }

  cameraPosition: Vector3Component = {
    x: 0,
    y: 0,
    z: 0
  }

  rotation: Vector3Component = {
    x: 0,
    y: 0,
    z: 0
  }

  constructor() {
    this.username = this.id
  }
}

/**
 * Manage some state for all the connected users. It's an isomorphic
 * class being used on clients and the server.
 */
export class CharacterManager extends EventEmitter {
  characters: Character[] = []
  expirationTimers: ICharacterExpiration[] = []

  /**
   * Stop a timer that expires a Character
   */
  cancelExpiration(id: string): void {
    this.expirationTimers = this.expirationTimers.filter(
      (exp: ICharacterExpiration) => {
        if (exp.id === id) {
          clearTimeout(exp.timer)
          return false
        }

        return true
      }
    )
  }

  /**
   * Start a timer that will remove a Character
   */
  scheduleExpiration(id: string): void {
    this.cancelExpiration(id)
    const timer = setTimeout(() => this.characterPart({ id }), characterIdleMs)
    this.expirationTimers.push({ id, timer })
  }

  /**
   * When the characters join we want to validate then add them into the list
   */
  characterJoin(joinEvent: ICharacterJoinEvent): boolean {
    let { characters } = this
    const { id, username, rotation } = joinEvent
    let { position } = joinEvent
    const existing: Character | undefined = find(characters, { id })

    if (
      isValidId(id) === false &&
      isValidUsername(username) === false &&
      isValidVector3Component(position) === false &&
      isValidVector3Component(rotation) === false
    ) {
      // this isn't really good feedback of what went wrong
      // a possible improvement would be to give a message
      return false
    }

    position = clampVector3(position)
    this.scheduleExpiration(id)

    if (existing === undefined) {
      const char = new Character()
      char.id = id
      char.username = username
      char.position = position
      char.rotation = rotation
      characters.push(char)
      this.characters = characters
      return true
    }

    characters = characters.map((char: Character) => {
      if (char.id === id) {
        char.username = username
        char.position = position
        char.rotation = rotation
      }

      return char
    })

    this.characters = characters
    return true
  }

  /**
   * Remove a character from the list
   */
  characterPart(partEvent: ICharacterPartEvent): void {
    const { id } = partEvent
    this.cancelExpiration(id)
    this.characters = this.characters.filter(
      (char: Character) => char.id !== id
    )
  }

  /**
   * A user decides to change their randomized name
   */
  updateCharacterUsername(usernameEvent: ICharacterUsernameEvent): boolean {
    let { characters } = this
    const { id, username } = usernameEvent
    const existing: Character | undefined = find(characters, { id })

    if (
      isValidId(id) === false ||
      isValidUsername(username) === false ||
      existing === undefined
    ) {
      return false
    }

    this.scheduleExpiration(id)

    characters = characters.map((char: Character) => {
      if (char.id === id) {
        char.username = username
      }

      return char
    })

    this.characters = characters
    return true
  }

  /**
   * Handle each user's {x,y,z} movement
   */
  updateCharacterPosition(positionEvent: ICharacterPositionEvent): boolean {
    let { characters } = this
    const { id } = positionEvent
    let { position, cameraPosition, playerHeight } = positionEvent
    const existing: Character | undefined = find(characters, { id })

    if (
      isValidId(id) === false ||
      isValidVector3Component(position) === false ||
      isValidVector3Component(cameraPosition) === false ||
      isNumber(playerHeight) === false ||
      existing === undefined
    ) {
      return false
    }

    position = clampVector3(position)
    cameraPosition = clampVector3(cameraPosition)
    playerHeight = clampNumber(playerHeight)

    this.scheduleExpiration(id)

    characters = characters.map((char: Character) => {
      if (char.id === id) {
        char.position = position
        char.cameraPosition = cameraPosition
        char.playerHeight = playerHeight
      }

      return char
    })

    this.characters = characters
    return true
  }

  /**
   * Handle the {x,y,z} of where the users are looking
   */
  updateCharacterRotation(rotationEvent: ICharacterRotationEvent): boolean {
    let { characters } = this
    const { id, rotation } = rotationEvent
    const existing: Character | undefined = find(characters, { id })

    if (
      isValidId(id) === false ||
      isValidVector3Component(rotation) === false ||
      existing === undefined
    ) {
      return false
    }

    this.scheduleExpiration(id)

    characters = characters.map((char: Character) => {
      if (char.id === id) {
        char.rotation = rotation
      }

      return char
    })

    this.characters = characters
    return true
  }

  /**
   * Output an array of the user ID strings
   */
  ids(): string[] {
    return this.characters.map(char => char.id)
  }

  /**
   * Refresh the timer that will expire a character.
   */
  ping(pingEvent: ICharacterPingEvent): void {
    const { id } = pingEvent

    if (isValidId(id) === false) {
      return
    }

    this.scheduleExpiration(id)
  }

  /**
   * This object can be used as part of a chain of event emitters
   * so it's helpful to allow other parts of the app to simply
   * emit into this object.
   */
  constructor() {
    super()

    const {
      characterJoin,
      characterPart,
      updateCharacterUsername,
      updateCharacterPosition,
      updateCharacterRotation,
      ping
    } = this

    // bind `this` so we keep the instance right
    this.on("character-join", characterJoin.bind(this))
    this.on("character-part", characterPart.bind(this))
    this.on("character-username", updateCharacterUsername.bind(this))
    this.on("character-position", updateCharacterPosition.bind(this))
    this.on("character-rotation", updateCharacterRotation.bind(this))
    this.on("character-ping", ping.bind(this))
  }
}
