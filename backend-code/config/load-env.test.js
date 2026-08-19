const path = require('path');

describe('backend environment loader', () => {
  test('always resolves backend-code/.env independently of cwd', () => {
    const state = require('./load-env');
    expect(state.envPath).toBe(path.resolve(__dirname, '..', '.env'));
    expect(state.loaded).toBe(true);
  });
});
