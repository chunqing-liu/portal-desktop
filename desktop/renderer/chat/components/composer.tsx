import { useReducer } from 'react';
import { RichComposer, type RichComposerProps } from '../../shared/components/rich-composer';
import { useModel } from '../../shared/hooks/use-model';
import type { ChatState } from '../models/chat';

/** Keep keystrokes out of the history render path; send always reads the live draft. */
export function ChatComposer({ state, ...props }: Omit<RichComposerProps, 'value' | 'onChange'> & { state: ChatState }) {
  useModel(state);
  const [, redraw] = useReducer((version: number) => version + 1, 0);
  return <RichComposer {...props} value={state.draft} onChange={value => {
    const hadText = Boolean(state.draft.trim());
    state.draft = value;
    // The surrounding send/stop and queue controls only depend on emptiness.
    if (hadText !== Boolean(value.trim())) state.changed();
    else redraw();
  }} />;
}
