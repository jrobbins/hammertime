# HammerTime Agent Guidelines

- Always run unit tests (`~/.nvm/versions/node/v22.16.0/bin/npm run test` or `node --run test`) on each turn of the conversation.
- When adding or modifying features, update the unit test suite in `test/` and verify `npm run test` passes.
