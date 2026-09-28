import { PipeTransform, UnprocessableEntityException } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Usage: @Body(new ZodValidationPipe(createCourseSchema)) body: CreateCourseInput */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}
