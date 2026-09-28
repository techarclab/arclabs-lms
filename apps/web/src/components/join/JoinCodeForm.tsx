'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, KeyRound } from 'lucide-react';
import { normalizeJoinCode } from '@arc/validation';
import { Button, Input } from '@arc/ui';

/** Small "enter your college's join code" form. */
export function JoinCodeForm({ className }: { className?: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const c = normalizeJoinCode(code);
        if (c.length >= 4) router.push(`/join/${encodeURIComponent(c)}`);
      }}
    >
      <div className="flex gap-2">
        <Input
          leading={<KeyRound />}
          placeholder="e.g. ANURAG-7K2Q"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="h-11 font-mono tracking-wider uppercase"
          aria-label="College join code"
        />
        <Button type="submit" size="lg" disabled={normalizeJoinCode(code).length < 4}>
          Join <ArrowRight />
        </Button>
      </div>
    </form>
  );
}
