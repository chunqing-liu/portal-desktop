import { stripIntelligentUIContext } from '../../shared/intelligent-ui/context';
import { stripScenePortalNotice } from '../../../shared/scene-portal-context';
import { stripComposerCommandContext } from './composer-command-context';

// Compatibility only: hide instructions stored by older clients. Previewing files
// is a renderer capability and must not add instructions to outgoing messages.
export function stripLocalFileContext(text: string): string {
  return text.replace(/\n\n\[客户端本地文件预览\]\n[\s\S]*?\n\[\/客户端本地文件预览\]/g, '');
}
export function stripClientMessageContext(text: string): string {
  return stripScenePortalNotice(stripLocalFileContext(stripIntelligentUIContext(stripComposerCommandContext(text))));
}
