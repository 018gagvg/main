import { Transaction } from '../../src/integrations/pluggable/transaction';

const transaction: Transaction = new Transaction();

describe.only('Transaction', () => {
  describe('extracts info from module/function of the first `in_app` frame', () => {
    it('using module only', async () => {
      const event = await transaction.process({
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  {
                    filename: '/some/file1.js',
                    in_app: false,
                    module: 'Foo',
                  },
                  {
                    filename: '/some/file2.js',
                    in_app: true,
                    module: 'Qux',
                  },
                ],
              },
            },
          ],
        },
      });
      expect(event.transaction).toEqual('Qux/?');
    });

    it('using function only', async () => {
      const event = await transaction.process({
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  {
                    filename: '/some/file1.js',
                    function: 'Bar',
                    in_app: false,
                  },
                  {
                    filename: '/some/file2.js',
                    function: 'Baz',
                    in_app: true,
                  },
                ],
              },
            },
          ],
        },
      });
      expect(event.transaction).toEqual('?/Baz');
    });

    it('using module and function', async () => {
      const event = await transaction.process({
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  {
                    filename: '/some/file1.js',
                    function: 'Bar',
                    in_app: true,
                    module: 'Foo',
                  },
                  {
                    filename: '/some/file2.js',
                    function: 'Baz',
                    in_app: false,
                    module: 'Qux',
                  },
                ],
              },
            },
          ],
        },
      });
      expect(event.transaction).toEqual('Foo/Bar');
    });

    it('using default', async () => {
      const event = await transaction.process({
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  {
                    filename: '/some/file1.js',
                    in_app: false,
                  },
                  {
                    filename: '/some/file2.js',
                    in_app: true,
                  },
                ],
              },
            },
          ],
        },
      });
      expect(event.transaction).toEqual('<unknown>');
    });

    it('no value with no `in_app` frame', async () => {
      const event = await transaction.process({
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  {
                    filename: '/some/file1.js',
                    in_app: false,
                  },
                  {
                    filename: '/some/file2.js',
                    in_app: false,
                  },
                ],
              },
            },
          ],
        },
      });
      expect(event.transaction).toBeUndefined();
    });
  });
});
