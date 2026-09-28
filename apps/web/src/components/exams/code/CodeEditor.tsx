'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import type { CodeLanguageName } from '@arc/types';
import { cn } from '@arc/ui';

const CodeMirror = dynamic(() => import('@uiw/react-codemirror'), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-[#282c34]" />,
});

export const LANGUAGE_LABEL: Record<CodeLanguageName, string> = { c: 'C', python: 'Python 3' };

/** Code editor with syntax highlighting (no autocompletion — students write their own code). */
export function CodeEditor({
  value,
  onChange,
  language,
  height = '320px',
  readOnly = false,
  className,
}: {
  value: string;
  onChange?: (v: string) => void;
  language: CodeLanguageName;
  height?: string;
  readOnly?: boolean;
  className?: string;
}) {
  const extensions = useMemo(() => [language === 'python' ? python() : cpp()], [language]);
  return (
    <div
      data-allow-typing
      className={cn('overflow-hidden rounded-xl bg-[#282c34] ring-1 ring-ink-900/20', className)}
      style={{ height }}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme={oneDark}
        height={height}
        editable={!readOnly}
        readOnly={readOnly}
        basicSetup={{
          autocompletion: false,
          foldGutter: false,
          searchKeymap: false,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
          tabSize: 4,
        }}
        className="text-[13.5px]"
      />
    </div>
  );
}
