import {AttachmentDownload} from './attachment-download';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
const time=(value:number)=>Number.isFinite(value) ? `${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}` : '0:00';
export function AttachmentAudio({src,name,endpoint,id}:{src:string;name:string;endpoint:string;id:string}) {
  const audio=useRef<HTMLAudioElement>(null);
  const [playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[duration,setDuration]=useState(0),[error,setError]=useState('');
  const [volume,setVolume]=useState(1),[speed,setSpeed]=useState('1'),[speedOpen,setSpeedOpen]=useState(false);
  const closeSpeed=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keepSpeed=()=>{clearTimeout(closeSpeed.current);};
  useEffect(()=>()=>clearTimeout(closeSpeed.current),[]);
  const [peaks,setPeaks]=useState<number[]>(Array(28).fill(.12));
  useEffect(()=>{
    const controller=new AbortController();let context:AudioContext | undefined;
    // Bound preview decoding so long recordings do not allocate an unbounded audio buffer.
    void (async()=>{
      const response=await fetch(src,{signal:controller.signal});
      if(!response.ok || Number(response.headers.get('content-length'))>16*1024*1024){await response.body?.cancel();return;}
      const reader=response.body!.getReader(),chunks:Uint8Array[]=[];let size=0;
      try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16*1024*1024)return;chunks.push(value);}}finally{await reader.cancel();}
      if(controller.signal.aborted)return;
      context=new AudioContext();const data=await context.decodeAudioData(await new Blob(chunks as BlobPart[]).arrayBuffer());
      if(controller.signal.aborted)return;
      const samples=data.getChannelData(0),values=Array.from({length:28},(_,index)=>{
        const from=Math.floor(index*samples.length/28),to=Math.floor((index+1)*samples.length/28);let peak=0;
        for(let i=from;i<to;i++)peak=Math.max(peak,Math.abs(samples[i]));return peak;
      });
      const max=Math.max(...values,.001);setPeaks(values.map(value=>Math.max(.12,value/max)));
    })().catch(()=>{}).finally(()=>{void context?.close().catch(()=>{});});
    return ()=>{controller.abort();void context?.close().catch(()=>{});};
  },[src]);
  return <div className="attachment-audio" onMouseDown={event=>{
    const target=(event.target as HTMLElement).closest<HTMLElement>('button,summary');
    if(target){event.preventDefault();target.focus({preventScroll:true});}
  }}>
    <audio ref={audio} src={src} preload="metadata" onLoadedMetadata={()=>setDuration(audio.current?.duration || 0)} onTimeUpdate={()=>setPosition(audio.current?.currentTime || 0)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onError={()=>{setPlaying(false);setError('音频暂时无法播放');}} />
    <button type="button" aria-label={`${playing ? '暂停' : '播放'} ${name}`} onClick={()=>{
      if(playing)audio.current?.pause();else {setError('');void audio.current?.play().catch(()=>setError('音频暂时无法播放'));}
    }}><svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true">{playing ? <path d="M5 4h3v12H5zm7 0h3v12h-3z"/> : <path d="m6 3 11 7-11 7z"/>}</svg></button>
    <div className="audio-waveform">
      <div className="audio-waveform-bars" aria-hidden="true">{peaks.map((peak,index)=><i key={index} style={{height:`${peak*100}%`,background:index/peaks.length<=position/(duration || 1) ? '#f5f5f5' : '#606060'}}/>)}</div>
      <input type="range" aria-label={`${name} 播放进度`} min={0} max={Number.isFinite(duration) && duration>0 ? duration : 1} step={0.1} value={position} disabled={!Number.isFinite(duration) || !duration} onChange={event=>{if(audio.current){audio.current.currentTime=Number(event.target.value);setPosition(Number(event.target.value));}}}/>
    </div>
    <span>{time(position)}</span>
    <AttachmentDownload endpoint={endpoint} id={id} name={name} compact details={<div className="audio-settings" onMouseEnter={keepSpeed} onMouseLeave={()=>{closeSpeed.current=setTimeout(()=>setSpeedOpen(false),180);}}>
      <label className="audio-volume"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4 6 8H3v8h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg><input aria-label="音量" type="range" min="0" max="1" step="0.05" value={volume} style={{'--volume':`${volume*100}%`} as CSSProperties} onChange={event=>{const value=Number(event.target.value);setVolume(value);if(audio.current)audio.current.volume=value;}}/></label>
      <button className="audio-speed-toggle" type="button" onMouseEnter={()=>{keepSpeed();setSpeedOpen(true);}} aria-expanded={speedOpen} onClick={()=>setSpeedOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9M16 4l3 3m2 2v1M12 7v5l3 3"/></svg><span>速度</span><small>{speed==='1' ? '' : `${speed}×`}</small><span className="audio-speed-chevron">{'›'}</span></button>
      {speedOpen && <div className="audio-speed-options" role="group" aria-label="播放速度"><button className="audio-speed-back" type="button" onClick={()=>setSpeedOpen(false)}>‹ 播放速度</button>{['0.5','0.75','1','1.25','1.5','2'].map(value=><button key={value} type="button" aria-pressed={speed===value} onClick={()=>{setSpeed(value);setSpeedOpen(false);if(audio.current)audio.current.playbackRate=Number(value);}}>{value}×</button>)}</div>}
    </div>}>下载</AttachmentDownload>
    {error && <small role="alert">{error}</small>}
  </div>;
}
