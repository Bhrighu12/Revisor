/**
 * Minimal markdown renderer for AI feedback (headings, bold, italics,
 * bullet lists, paragraphs). Avoids pulling in a full markdown library.
 */

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on **bold** and *italic* spans.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  parts.forEach((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      nodes.push(<strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      nodes.push(<em key={`${keyBase}-${i}`}>{part.slice(1, -1)}</em>);
    } else if (part) {
      nodes.push(part);
    }
  });
  return nodes;
}

export default function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split(/\r?\n/);
  let list: string[] = [];

  const flushList = (key: string) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key} className="my-2 list-disc space-y-1 pl-5">
        {list.map((item, i) => (
          <li key={i}>{renderInline(item, `${key}-li-${i}`)}</li>
        ))}
      </ul>
    );
    list = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trim();
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const bullet = line.match(/^[-*•]\s+(.*)$/);

    if (bullet) {
      list.push(bullet[1]);
      return;
    }
    flushList(`ul-${i}`);

    if (heading) {
      blocks.push(
        <h4 key={`h-${i}`} className="mt-4 mb-1 font-semibold text-slate-900">
          {renderInline(heading[2], `h-${i}`)}
        </h4>
      );
    } else if (line) {
      blocks.push(
        <p key={`p-${i}`} className="my-2">
          {renderInline(line, `p-${i}`)}
        </p>
      );
    }
  });
  flushList("ul-end");

  return <div className="text-sm leading-relaxed text-slate-700">{blocks}</div>;
}
