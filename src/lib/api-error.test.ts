import { describe, expect, it } from 'vitest'

import { ApiError } from './api-error'

describe('ApiError', () => {
  it('sets message and statusCode', () => {
    const error = new ApiError('Not found', 404)

    expect(error.message).toEqual('Not found')
    expect(error.statusCode).toEqual(404)
  })

  it('defaults statusCode to 500', () => {
    const error = new ApiError('Something went wrong')

    expect(error.statusCode).toEqual(500)
  })

  it('is an instance of Error', () => {
    const error = new ApiError('Bad request', 400)

    expect(error).toBeInstanceOf(Error)
  })
})
