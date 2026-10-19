import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Notes remain Markdown strings; only this restricted presentation parses them. */
export function ParticipantNote({ hint }: { hint: string }) {
  return (
    <div className="participant-note whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere] [&_p+p]:mt-[0.6em] [&_strong]:font-bold [&_em]:italic [&_ul]:my-[0.35em] [&_ul]:list-disc [&_ul]:pl-[1.5em] [&_ol]:my-[0.35em] [&_ol]:list-decimal [&_ol]:pl-[1.5em] [&_li>p]:m-0">
      <Markdown
        remarkPlugins={[remarkGfm]}
        allowedElements={['p', 'br', 'strong', 'em', 'del', 'ul', 'ol', 'li']}
        unwrapDisallowed
        skipHtml
      >
        {hint}
      </Markdown>
    </div>
  );
}