import { Vector3Component } from "decentraland-api";
import { boundsMax, boundsMin } from "./config";

const isNumber = require("lodash/isNumber");
const isFinite = require("lodash/isFinite");
const clamp = require("lodash/clamp");

const validIdPattern = /^character-\d{5,20}$/;
const validUsernamePattern = /^[0-9a-zA-Z\-\_\.\ ]{3,20}$/;

/**
 * Generate a random id for the character
 * @returns {string}
 */
export const randomId = (): string => {
  const randPart: string = Math.random()
    .toString()
    .substring(2, 8);
  return `character-${randPart}`;
};

/**
 * True if valid id
 */
export const isValidId = (id?: string): boolean =>
  id !== undefined && id !== null && validIdPattern.test(id) === true;

/**
 * Check if the user input is a valid username
 */
export const isValidUsername = (username?: string): boolean =>
  username !== undefined &&
  username !== null &&
  validUsernamePattern.test(username) === true;

/**
 * An actual JS number excluding NaN and Intinity
 */
export const isValidNumber = (num?: number | string) =>
  num !== undefined &&
  num !== null &&
  // numeric
  isNumber(num) === true &&
  // not infinity, not NaN
  isFinite(num) === true;

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
  num <= boundsMax;

/**
 * Returns true if the Vector3Component has valid coordinates
 */
export function isValidVector3Component(v3?: Vector3Component): boolean {
  if (v3 === undefined || v3 === null) {
    return false;
  }

  const { x, y, z } = v3;
  return [x, y, z].every((num) => isValidNumber(num)) === true;
}

/**
 * Clamp a number to the configured bounds
 */
export const clampNumber = (num: number): number =>
  clamp(num, boundsMin, boundsMax);

/**
 * Limit the {x,y,z} of a Vector3Component object to the configured bounds
 */
export const clampVector3 = (v3: Vector3Component): Vector3Component => ({
  x: clampNumber(v3.x),
  y: clampNumber(v3.y),
  z: clampNumber(v3.z),
});
