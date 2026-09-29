import { Injectable, Logger } from '@nestjs/common';
import type { CodingConfig } from '@arc/types';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CodeRunner } from './code-runner';

const isBlank = (s: string | undefined | null) => !s || s.trim() === '';

/**
 * Fills in test cases whose expected output was left empty, by running the question's reference
 * solution. The result is saved on the question, so it only happens once per question. Used when
 * a question is saved, and again just before running/grading in case the runner was asleep then.
 */
@Injectable()
export class ExpectedOutputs {
  private readonly logger = new Logger(ExpectedOutputs.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: CodeRunner,
  ) {}

  needsFill(c: CodingConfig | null | undefined) {
    return Boolean(c?.solution?.code?.trim() && c.testCases.some((t) => isBlank(t.output)));
  }

  /** Returns the config with blanks filled (unchanged when it can't run the solution now). */
  async ensure(questionId: string, c: CodingConfig): Promise<CodingConfig> {
    if (!this.needsFill(c) || !this.runner.configured) return c;
    try {
      const runs = await this.runner.runMany(
        c.solution!.language,
        c.solution!.code,
        c.testCases.map((t) => t.input),
        c.timeLimitMs ?? 2000,
      );
      let changed = false;
      const testCases = c.testCases.map((t, i) => {
        const r = runs[i];
        if (!isBlank(t.output) || !r || r.status !== 'OK') return t;
        changed = true;
        return { ...t, output: r.stdout };
      });
      if (!changed) return c;
      const next = { ...c, testCases };
      await this.prisma.question.update({
        where: { id: questionId },
        data: { coding: next as unknown as Prisma.InputJsonValue },
      });
      return next;
    } catch (e) {
      this.logger.warn(
        `Could not fill expected outputs for ${questionId}: ${(e as Error).message}`,
      );
      return c;
    }
  }
}
