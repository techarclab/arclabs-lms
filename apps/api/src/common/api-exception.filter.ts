import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorBody } from '@arc/types';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
};

function isPrismaError(e: unknown, code: string): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === code;
}

/** Converts every error into the standard ApiErrorBody shape. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiError');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiErrorBody['error'] = { code: 'INTERNAL', message: 'Something went wrong' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      const obj = typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : {};
      body = {
        code: (obj.code as string) ?? CODE_BY_STATUS[status] ?? 'ERROR',
        message: (obj.message as string) ?? exception.message,
        ...(obj.details !== undefined ? { details: obj.details } : {}),
      };
    } else if (isPrismaError(exception, 'P2002')) {
      status = HttpStatus.CONFLICT;
      const target = (exception as { meta?: { target?: unknown } }).meta?.target;
      body = {
        code: 'CONFLICT',
        message: 'A record with these values already exists',
        details: { fields: target },
      };
    } else if (isPrismaError(exception, 'P2025')) {
      status = HttpStatus.NOT_FOUND;
      body = { code: 'NOT_FOUND', message: 'Not found' };
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({ error: body, requestId: req.id } satisfies ApiErrorBody);
  }
}
