import {useEffect} from 'react';
import {registerDownloadBridge} from '../services/attachment-download-bridge';
export function useAttachmentDownloadBridge(endpoint:string,id:string) {
  useEffect(()=>registerDownloadBridge(endpoint,id),[endpoint,id]);
}
