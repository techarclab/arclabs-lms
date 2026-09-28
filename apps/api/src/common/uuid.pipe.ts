import { NotFoundException, PipeTransform } from '@nestjs/common';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Malformed ids are reported as 404, the same as ids the caller may not see. */
export class UuidPipe implements PipeTransform<string, string> {
  transform(value: string) {
    if (!UUID_RE.test(value)) throw new NotFoundException();
    return value;
  }
}
