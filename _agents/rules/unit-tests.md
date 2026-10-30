---
trigger: always_on
description: "Always run unit tests via `npm run test` on every turn of the conversation."
---

# Run Unit Tests on Every Turn

- On every turn of the conversation in this repository, always run the unit test suite (`~/.nvm/versions/node/v22.16.0/bin/npm run test` or `node --run test`) before finishing your response.
- Whenever adding or modifying game mechanics, powerups, physics, or rendering, update the unit tests in `test/` so they cover the changes and verify all tests pass.
