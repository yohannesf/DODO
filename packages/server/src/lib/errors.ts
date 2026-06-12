export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, `${what} not found`);
export const badRequest = (msg: string) => new AppError(400, msg);
export const conflict = (msg: string) => new AppError(409, msg);
