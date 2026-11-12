import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function TicketDescription({ description }: { description: string }) {
  if (!description) return <p className="text-sm leading-7 text-muted">Aucune description renseignée.</p>;

  return <div className="min-w-0 text-sm leading-7 text-ink [overflow-wrap:anywhere] [&_p]:whitespace-pre-wrap [&_p+p]:mt-3 [&_strong]:font-bold [&_em]:italic [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_h4]:text-sm [&_h5]:text-sm [&_h6]:text-sm [&_:is(h1,h2,h3,h4,h5,h6)]:my-3 [&_:is(h1,h2,h3,h4,h5,h6)]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li>p]:m-0 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_code]:rounded-sm [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_pre]:my-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-sm [&_pre]:bg-slate-100 [&_pre]:p-3 [&_pre]:whitespace-pre [&_pre_code]:p-0 [&_hr]:my-4 [&_hr]:border-line [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-line [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-1">
    <Markdown
      remarkPlugins={[remarkGfm]}
      allowedElements={['p', 'br', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td']}
      unwrapDisallowed
      components={{
        a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="text-brand underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-brand">{children}</a> : <span>{children}</span>,
        table: ({ children }) => <div className="my-3 max-w-full overflow-x-auto"><table>{children}</table></div>,
      }}
    >{description}</Markdown>
  </div>;
}