import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { marked } from 'marked';

type References = ReturnType<typeof marked.lexer>['links'];
export const MarkdownReferences = createContext<References>({});

/** Preserve document-level image/link definitions when an answer is split around artifacts. */
export function MarkdownReferenceScope({text,children}: {text:string;children:ReactNode}) {
  const inherited = useContext(MarkdownReferences);
  const references = useMemo(()=>({...inherited,...marked.lexer(text,{gfm:true}).links}),[text,inherited]);
  return <MarkdownReferences.Provider value={references}>{children}</MarkdownReferences.Provider>;
}
