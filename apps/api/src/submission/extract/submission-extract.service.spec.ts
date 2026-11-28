import { buildExtractTree } from './submission-extract.service';

describe('buildExtractTree', () => {
  it('nests dirs and sorts dirs before files', () => {
    expect(
      buildExtractTree([
        { path: 'b.txt', size: 1 },
        { path: 'src/a.cpp', size: 2 },
        { path: 'src/util/h.h', size: 3 },
      ]),
    ).toEqual({
      root: [
        {
          name: 'src',
          type: 'dir',
          children: [
            {
              name: 'util',
              type: 'dir',
              children: [{ name: 'h.h', type: 'file', size: 3 }],
            },
            { name: 'a.cpp', type: 'file', size: 2 },
          ],
        },
        { name: 'b.txt', type: 'file', size: 1 },
      ],
    });
  });
});
