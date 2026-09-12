import { CorstenoApiError } from '@corsteno/client';

export function isNotFoundError(error: unknown) {
  return error instanceof CorstenoApiError && error.kind === 'not_found';
}
