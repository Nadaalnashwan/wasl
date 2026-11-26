import * as React from "react";

/** Renders `text` with the first occurrence of `mark` behind a highlighter (Wasl's signature). Presentation only. */
export function Marked({ text, mark }: { text: string; mark?: string }) {
  const i = mark ? text.indexOf(mark) : -1;
  if (!mark || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="highlight">{mark}</span>
      {text.slice(i + mark.length)}
    </>
  );
}
