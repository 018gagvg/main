import { getModule } from '../src/module';

function withFilename(fn: () => void, filename: string) {
  const prevFilename = require.main?.filename;
  if (require.main?.filename) {
    require.main.filename = filename;
  }

  try {
    fn();
  } finally {
    if (require.main && prevFilename) {
      require.main.filename = prevFilename;
    }
  }
}

describe('getModule', () => {
  test('Windows', async () => {
    withFilename(() => {
      expect(getModule('C:\\Users\\users\\Tim\\Desktop\\node_modules\\module.js')).toEqual('module');
    }, 'C:\\Users\\Tim\\app.js');
  });

  test('POSIX', async () => {
    withFilename(() => {
      expect(getModule('/Users/users/Tim/Desktop/node_modules/module.js')).toEqual('module');
    }, '/Users/Tim/app.js');
  });
});
