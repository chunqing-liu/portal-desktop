const storageKey='attachment-image-sizes-v1';
type Size={width:number;height:number};
function valid(value:any):value is Size {return Number.isFinite(value?.width)&&Number.isFinite(value?.height)&&value.width>0&&value.height>0&&value.width<=100000&&value.height<=100000;}
function read():Record<string,Size>{try{return JSON.parse(localStorage.getItem(storageKey)||'{}') || {};}catch{return {};}}
export function imagePreviewSize(endpoint:string,id:string):Size|undefined {
  const value=read()[JSON.stringify([endpoint,id])];
  if(!valid(value))return;
  const scale=Math.min(1,220/value.width,320/value.height);
  return {width:value.width*scale+2,height:value.height*scale+2};
}
export function rememberImageSize(endpoint:string,id:string,width:number,height:number) {
  const value={width,height};if(!valid(value))return;
  const entries=read(),key=JSON.stringify([endpoint,id]);delete entries[key];entries[key]=value;
  try{localStorage.setItem(storageKey,JSON.stringify(Object.fromEntries(Object.entries(entries).slice(-256))));}catch{/* Preview remains usable without storage. */}
}
