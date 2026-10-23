/** An error that maps directly onto an HTTP response for the client. */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code Stable machine-readable identifier the client can switch on.
   * @param {string} message Safe to show to the user.
   * @param {{ fieldErrors?: Record<string, string>, headers?: Record<string, string> }} [extra]
   */
  constructor(status, code, message, { fieldErrors, headers } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.headers = headers;
  }
}

/**
 * @param {unknown} body
 * @param {number} [status]
 * @param {Record<string, string>} [headers]
 */
export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

/** @param {HttpError} error */
export function errorResponse(error) {
  const { status, code, message, fieldErrors, headers } = error;
  return json({ error: { code, message, fieldErrors } }, status, headers);
}

/**
 * Reads and parses a JSON body, refusing anything larger than `maxBytes`.
 * @param {Request} request
 * @param {number} maxBytes
 */
export async function readJsonBody(request, maxBytes) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the request as JSON.');
  }
  const tooLarge = new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
  if (Number(request.headers.get('content-length')) > maxBytes) throw tooLarge;

  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) throw tooLarge;
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'The request body is not valid JSON.');
  }
}
