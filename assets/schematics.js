/* 示意图数据在验证卡密后从 Cloudflare 读取。 */
let SCHEMATICS={};
function schematicFor(p){
  if(SCHEMATICS[p.id])return SCHEMATICS[p.id];
  // 趋势线、量价等章节属于分析方法，使用中性示意，避免把整幅案例误当形态。
  if(p.sig==='看涨')return [[67,70,40,42],[43,68,41,65]];
  if(p.sig==='看跌')return [[37,64,35,62],[64,67,36,39]];
  return [[48,57,38,53],[53,65,46,59],[59,67,50,54]];
}
