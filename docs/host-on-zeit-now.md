
# sample-sync-websockets: Host on Zeit Now

It's possible to customize this sample and host it on Zeit Now, the nodejs hosting service.

If you're not familiar please visit [zeit.co/now](https://zeit.co/now) to get the full story on Zeit Now service, sign-up, and `now login` via the CLI before continuing.

This is an option that you can use, for free for small deployments, to host a node service.

---

## The Zeit Now configuration

You can create the `now` object in `./package.json` or use a `./now.json` file. Below I'm going with the former.

```json
"now": {
  "type": "npm",
  "public": true,
  "scale": {
    "sfo1": {
      "min": 1,
      "max": 1
    }
  },
  "env": {
    "NODE_ENV": "production"
  },
  "files": [
    ".dclignore",
    "character-manager.ts",
    "character.ts",
    "config.ts",
    "formats.ts",
    "package-lock.json",
    "package.json",
    "server.ts",
    "tsconfig-server.json"
  ],
  "engines": {
    "node": "^8.0.0"
  }
}
```

Just run `now deploy` and it's done!

They really make it easy there.
