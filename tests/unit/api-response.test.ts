import { describe, it, expect } from 'vitest';
import { createPaginationMeta } from '../../src/common/utils/api-response';

describe('createPaginationMeta', () => {
  it('calculates totalPages, hasNextPage, and hasPreviousPage accurately', () => {
    const meta = createPaginationMeta(1, 10, 25);
    expect(meta).toEqual({
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it('correctly reports middle page navigation states', () => {
    const meta = createPaginationMeta(2, 10, 25);
    expect(meta).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('correctly reports last page navigation states', () => {
    const meta = createPaginationMeta(3, 10, 25);
    expect(meta).toEqual({
      page: 3,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });

  it('handles empty results', () => {
    const meta = createPaginationMeta(1, 10, 0);
    expect(meta).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });
});

