import { getAttributesToRecord } from '../../../../src/coreHandlers/util/getAttributesToRecord.ts';

it('records only included attributes', function () {
  expect(
    getAttributesToRecord({
      id: 'foo',
      class: 'btn btn-primary',
    }),
  ).toEqual({
    id: 'foo',
    class: 'btn btn-primary',
  });

  expect(
    getAttributesToRecord({
      id: 'foo',
      class: 'btn btn-primary',
      tabIndex: 2,
      ariaDescribedBy: 'tooltip-1',
    }),
  ).toEqual({
    id: 'foo',
    class: 'btn btn-primary',
  });

  expect(
    getAttributesToRecord({
      tabIndex: 2,
      ariaDescribedBy: 'tooltip-1',
    }),
  ).toEqual({});
});
