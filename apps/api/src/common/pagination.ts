export type PaginationQuery = {
  page?: number;
  limit?: number;
};

export type Paginated<T> = {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
};

export function resolvePagination(query?: PaginationQuery): {
  page: number;
  limit: number;
  skip: number;
  take: number;
} {
  const page = Number.isInteger(query?.page) && (query?.page as number) > 0
    ? (query?.page as number)
    : 1;
  const requestedLimit =
    Number.isInteger(query?.limit) && (query?.limit as number) > 0
      ? (query?.limit as number)
      : 20;
  const limit = Math.min(requestedLimit, 100);
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function toPaginated<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): Paginated<T> {
  return {
    data,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
