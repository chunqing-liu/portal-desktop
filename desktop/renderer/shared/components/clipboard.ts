import { createContext } from 'react';

/** Host-provided clipboard bridge; browser API is the standalone fallback. */
export const CodeClipboard = createContext<(text: string) => Promise<void>>(text => navigator.clipboard.writeText(text));
