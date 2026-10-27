export function ComposerMenuIcon({ kind }: { kind: 'file' | 'ui' | 'image' | 'doc' | 'subagent' | 'example' }) {
  return <span className="composer-menu-icon" data-kind={kind} aria-hidden="true"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'file' ? <path d="m8 13 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7l10-10M6 15l9-9"/>
      : kind === 'ui' ? <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M10 10v10"/></>
      : kind === 'image' ? <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>
      : kind === 'doc' ? <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></>
      : kind === 'subagent' ? <><rect x="8" y="3" width="8" height="6" rx="2"/><path d="M12 9v4M6 16v-3h12v3"/><rect x="3" y="16" width="6" height="5" rx="1.5"/><rect x="15" y="16" width="6" height="5" rx="1.5"/></>
      : <><path d="m9 5-6 7 6 7m6-14 6 7-6 7"/><path d="m13 5-2 14"/></>}
  </svg></span>;
}
