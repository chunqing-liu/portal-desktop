export function audioMenuPosition(rect:{top:number;bottom:number;right:number},viewport:{width:number;height:number}, size={height:196,submenuHeight:236}) {
  const gap=8,edge=12,width=Math.min(225,viewport.width-edge*2),height=size.height;
  const left=Math.max(edge,Math.min(viewport.width-width-edge,rect.right-width));
  const preferredTop=rect.top-height-gap>=edge ? rect.top-height-gap : rect.bottom+gap;
  const top=Math.max(edge,Math.min(viewport.height-height-edge,preferredTop));
  const submenuWidth=Math.min(220,viewport.width-edge*2),submenuHeight=size.submenuHeight;
  const submenuLeft=left>=submenuWidth+gap+edge ? -submenuWidth-gap
    : left+width+gap+submenuWidth<=viewport.width-edge ? width+gap
    : Math.max(edge-left,viewport.width-submenuWidth-left-edge);
  const submenuTop=Math.max(edge-top,Math.min(48,viewport.height-top-submenuHeight-edge));
  return {left,top,width,submenuLeft,submenuTop,submenuWidth};
}
