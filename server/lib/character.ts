import { Vector3Component } from "decentraland-api";
import { randomId } from "./formats";

/**
 * Representing a user in the scene. It is used both for
 * the user viewing as well as all the network users.
 */
export class Character {
  public id: string = randomId();
  public username: string = "";

  public position: Vector3Component = {
    x: 0,
    y: 0,
    z: 0,
  };

  public rotation: Vector3Component = {
    x: 0,
    y: 0,
    z: 0,
  };

  constructor() {
    this.username = this.id;
  }
}
