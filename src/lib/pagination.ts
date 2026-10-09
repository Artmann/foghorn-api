import type { PaginationDto } from '../api/schemas'

export function makePagination({
  limit,
  offset,
  total
}: {
  limit: number
  offset: number
  total: number
}): PaginationDto {
  const nextOffset = offset + limit

  return {
    limit,
    nextOffset: nextOffset < total ? nextOffset : null,
    offset,
    total
  }
}
