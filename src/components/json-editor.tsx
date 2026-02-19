'use client';

import Editor, { OnMount } from '@monaco-editor/react';

interface JsonEditorProps {
  value: string;
  readOnly?: boolean;
  height?: string | number;
}

export function JsonEditor({ value, readOnly = true, height = "100%" }: JsonEditorProps) {
  
  const handleEditorDidMount: OnMount = (editor, monaco) => {
    // Optional: minimize distraction
    editor.updateOptions({
      minimap: { enabled: false },
      fontSize: 13,
      lineHeight: 20,
      padding: { top: 16, bottom: 16 },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace",
    });

    // Format the document initially if needed, though we likely pass formatted JSON string
    // setTimeout(() => {
    //   editor.getAction('editor.action.formatDocument')?.run();
    // }, 200);
  };

  return (
    <div className="h-full w-full overflow-hidden rounded-xl border border-zinc-800 bg-[#1e1e1e]">
      <Editor
        height={height}
        defaultLanguage="json"
        value={value}
        theme="vs-dark"
        options={{
          readOnly,
          domReadOnly: readOnly,
          wordWrap: 'on',
        }}
        onMount={handleEditorDidMount}
        loading={
            <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                Loading editor...
            </div>
        }
      />
    </div>
  );
}
