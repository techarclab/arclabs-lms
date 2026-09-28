import { UnprocessableEntityException } from '@nestjs/common';
import { createCourseSchema } from '@arc/validation';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(createCourseSchema);

  it('returns parsed data with defaults', () => {
    const out = pipe.transform({ title: 'IoT Basics', slug: 'iot-basics' });
    expect(out.level).toBe('BEGINNER');
    expect(out.isPublic).toBe(false);
  });

  it('throws 422 with field details on invalid input', () => {
    try {
      pipe.transform({ title: 'x', slug: 'Bad Slug' });
      expect.unreachable('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      const body = (e as UnprocessableEntityException).getResponse() as {
        details: { path: string }[];
      };
      expect(body.details.map((d) => d.path).sort()).toEqual(['slug', 'title']);
    }
  });
});
