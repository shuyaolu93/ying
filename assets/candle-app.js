const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function lessonDiagram(p){
  const type=p.diagram;
  if(!type)return '';
  const base=(shapes,labels='')=>`<svg viewBox="0 0 380 160" role="img" aria-label="${escapeHTML(p.cn)}示意图"><g stroke-width="3" stroke-linecap="round">${shapes}</g><g fill="var(--dim)" font-size="12" font-family="var(--sans)" text-anchor="middle">${labels}</g></svg>`;
  const wick=(x,top,bottom,color)=>`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="${color}"/>`;
  const body=(x,top,bottom,color,width=36)=>`<rect x="${x-width/2}" y="${top}" width="${width}" height="${bottom-top}" fill="${color}" stroke="${color}"/>`;
  const red='var(--up)',green='var(--down)',gray='var(--dim)';
  if(type==='ohlc')return base(`${wick(190,22,140,gray)}<line x1="152" y1="68" x2="190" y2="68" stroke="${gray}"/><line x1="190" y1="100" x2="228" y2="100" stroke="${gray}"/>`,`<text x="190" y="17">最高</text><text x="114" y="73">开盘</text><text x="265" y="105">收盘</text><text x="190" y="157">最低</text>`);
  if(type==='bullbear')return base(`${wick(125,24,136,red)}${body(125,48,110,red)}${wick(255,24,136,green)}${body(255,48,110,green)}`,`<text x="125" y="154">阳线：收高于开</text><text x="255" y="154">阴线：收低于开</text>`);
  if(type==='anatomy')return base(`${wick(190,24,138,red)}${body(190,56,106,red)}`,`<text x="190" y="19">最高价</text><text x="285" y="43">上影线</text><text x="282" y="88">实体</text><text x="285" y="129">下影线</text>`);
  if(type==='spinning')return base(`${wick(120,28,137,red)}${body(120,78,91,red)}${wick(260,32,134,green)}${body(260,76,90,green)}`,`<text x="120" y="155">小实体</text><text x="260" y="155">颜色不限</text>`);
  if(type==='doji')return base(`${wick(100,23,138,gray)}<line x1="78" y1="82" x2="122" y2="82" stroke="${gray}"/>${wick(190,45,124,gray)}<line x1="168" y1="82" x2="212" y2="82" stroke="${gray}"/>${wick(280,18,137,gray)}<line x1="258" y1="82" x2="302" y2="82" stroke="${gray}"/>`,`<text x="190" y="155">开盘价 ≈ 收盘价</text>`);
  if(type==='timeframe')return base(`${wick(115,27,135,red)}${body(115,54,105,red)}${wick(265,27,135,red)}${body(265,54,105,red)}`,`<text x="115" y="155">日线：一天</text><text x="265" y="155">5分钟线：5分钟</text>`);
  return '';
}
/* ---- 蜡烛渲染 ---- */
function schematicSVG(p,detail=false){
  const arr=schematicFor(p),W=380,H=160;
  const y=v=>143-1.22*v;
  const step=Math.min(66,260/arr.length),start=(W-step*arr.length)/2;
  const x=i=>start+step*(i+.5);
  const bw=Math.min(42,step*.64);
  const before=p.sig==='看涨'||/bottom|bot|southern|inverted-hammer/.test(p.id);
  const after=p.sig==='看跌'||/top|northern/.test(p.id);
  const trendEnd=x(0)-step*.55;
  const trendY=before?104:(after?62:83);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHTML(p.cn)}形态示意图">`;
  if(!['ch11','ch13','ch14','ch15'].includes(p.ch)&&p.id!=='bar-chart')s+=`<path class="scheme-trend" d="M 16 ${before?34:after?119:72} L 38 ${before?53:after?100:83} L 50 ${before?46:after?107:76} L ${trendEnd} ${trendY}"/>`;
  if(detail&&p.id==='dark-cloud'){
    const mid=(arr[0][0]+arr[0][3])/2;
    s+=`<line class="scheme-guide" x1="${x(0)+bw/2}" y1="${y(mid)}" x2="${x(1)+32}" y2="${y(mid)}"/><text class="scheme-text" x="${x(1)+34}" y="${y(mid)+4}">前阳线中点</text>`;
  }
  if(detail&&/window|gap|tasuki/.test(p.id)&&arr.length>1){
    const a=arr[0],b=arr[1];
    const gap=b[2]>a[1]?[b[2],a[1]]:(b[1]<a[2]?[a[2],b[1]]:null);
    if(gap)s+=`<rect class="scheme-gap" x="${x(0)+bw/2+3}" y="${y(gap[0])}" width="${Math.max(8,x(1)-x(0)-bw-6)}" height="${y(gap[1])-y(gap[0])}"/>`;
  }
  arr.forEach((c,i)=>{
    const cx=x(i),cls=c[3]>c[0]?'kv-up':(c[3]<c[0]?'kv-down':'kv-neutral');
    s+=`<line class="kv-wick ${cls}" x1="${cx}" y1="${y(c[1])}" x2="${cx}" y2="${y(c[2])}"/>`;
    if(p.id==='bar-chart')s+=`<line class="kv-wick ${cls}" x1="${cx-bw/2}" y1="${y(c[0])}" x2="${cx}" y2="${y(c[0])}"/><line class="kv-wick ${cls}" x1="${cx}" y1="${y(c[3])}" x2="${cx+bw/2}" y2="${y(c[3])}"/>`;
    else{const top=Math.min(y(c[0]),y(c[3])),height=Math.max(Math.abs(y(c[3])-y(c[0])),3);s+=`<rect class="kv-body ${cls}" x="${cx-bw/2}" y="${top}" width="${bw}" height="${height}"/>`;}
  });
  if(p.ch==='gA'&&['on-neck','in-neck','thrusting'].includes(p.id)){
    const prior=arr[0],level=p.id==='on-neck'?prior[2]:p.id==='in-neck'?prior[3]:(prior[0]+prior[3])/2;
    s+=`<line class="scheme-guide" x1="${x(0)-bw/2}" y1="${y(level)}" x2="${x(1)+bw/2}" y2="${y(level)}"/>`;
  }
  if(p.ch==='gB'&&p.id==='trendline')s+=`<line class="kv-tline" x1="${x(0)}" y1="${y(34.5)}" x2="${x(arr.length-1)}" y2="${y(36)}"/>`;
  if(p.ch==='gB'&&p.id==='support-resistance')s+=`<line class="kv-sup" x1="50" y1="${y(34.5)}" x2="330" y2="${y(34.5)}"/><line class="kv-res" x1="50" y1="${y(37)}" x2="330" y2="${y(37)}"/>`;
  if((p.ch==='gB'&&['breakout','gaps','island','consolidation','double'].includes(p.id))||p.id==='box-range'){
    const level=p.id==='breakout'?36.2:(p.id==='gaps'||p.id==='island'?arr[0][1]:p.id==='double'?34.1:36.5);
    s+=`<line class="scheme-guide" x1="50" y1="${y(level)}" x2="330" y2="${y(level)}"/>`;
  }
  if(p.ch==='ch11'){
    const line=p.id==='tl-basics'?'<line x1="65" y1="111" x2="315" y2="65"/>':
      p.id==='upthrust'?'<line x1="65" y1="58" x2="315" y2="58"/>':'<line x1="65" y1="108" x2="315" y2="108"/>';
    s+=`<g class="kv-sup">${line}</g>`;
  }
  if(p.ch==='ch13')s+='<path class="kv-ma-fast" d="M 55 109 C 90 104 108 88 140 92 S 198 65 230 79 S 285 62 325 57"/><path class="kv-ma-slow" d="M 55 120 C 105 115 140 103 180 99 S 255 89 325 78"/>';
  if(p.ch==='ch14'){
    if(p.id==='rsi')s+='<line class="kv-rsi-high" x1="55" y1="128" x2="325" y2="128"/><line class="kv-rsi-low" x1="55" y1="148" x2="325" y2="148"/><path class="kv-ind-main" d="M 55 141 C 80 138 94 126 113 130 S 150 148 177 137 S 210 126 230 135 S 267 149 290 142 S 312 135 325 139"/><text class="kv-rsi-label kv-rsi-high-label" x="330" y="131">70</text><text class="kv-rsi-label kv-rsi-low-label" x="330" y="151">30</text>';
    else s+='<line class="kv-panel-grid" x1="55" y1="125" x2="325" y2="125"/><path class="kv-ind-main" d="M 55 139 C 85 136 95 147 125 139 S 168 124 195 133 S 239 149 266 138 S 300 128 325 132"/>';
  }
  if(p.ch==='ch15')s+=`<g class="kv-volume-up">${arr.map((_,i)=>`<rect x="${x(i)-bw/2}" y="${i===1?118:(i===0?133:137)}" width="${bw}" height="${i===1?32:(i===0?17:13)}"/>`).join('')}</g><line class="kv-grid" x1="65" y1="151" x2="315" y2="151"/>`;
  return s+'</svg>';
}

/* ---- 带坐标系的完整案例图 ---- */
let _svgUid=0;
function niceTicks(lo,hi,count){
  const span=(hi-lo)||1;
  const raw=span/count,mag=Math.pow(10,Math.floor(Math.log10(raw)));
  let step=raw/mag;
  if(step>=5)step=5;else if(step>=2)step=2;else step=1;
  step*=mag;
  const ticks=[];
  for(let t=Math.ceil(lo/step)*step;t<=hi+step*1e-6;t+=step)ticks.push(t);
  return ticks;
}
function fmtPrice(v){
  return Number(v.toFixed(Math.abs(v)<10?4:(Math.abs(v)<100?2:1))).toString();
}
function sma(values,period){
  return values.map((_,i)=>i<period-1?null:values.slice(i-period+1,i+1).reduce((a,b)=>a+b,0)/period);
}
function ema(values,period){
  let previous=values[0]||0;
  return values.map((v,i)=>previous=i?previous+(v-previous)*2/(period+1):v);
}
function indicatorSeries(candles,type){
  const closes=candles.map(c=>c[3]);
  if(type==='rsi'){
    const period=9;
    const main=closes.map((_,i)=>{
      if(i<period)return null;
      let gains=0,losses=0;
      for(let j=i-period+1;j<=i;j++){const d=closes[j]-closes[j-1];gains+=Math.max(d,0);losses+=Math.max(-d,0);}
      return losses===0?100:100-100/(1+gains/losses);
    });
    return {name:'RSI(9)',main,bounds:[0,100],guides:[30,70]};
  }
  if(type==='stochastics'){
    const raw=candles.map((c,i)=>{
      if(i<4)return null;
      const part=candles.slice(i-4,i+1);
      const low=Math.min(...part.map(v=>v[2])),high=Math.max(...part.map(v=>v[1]));
      return high===low?50:(c[3]-low)/(high-low)*100;
    });
    const average=(arr,i)=>{const a=arr.slice(i-2,i+1);return a.length<3||a.some(v=>v===null)?null:a.reduce((x,y)=>x+y,0)/3;};
    const main=raw.map((_,i)=>average(raw,i));
    return {name:'随机指数 %K / %D（5期示意）',main,signal:main.map((_,i)=>average(main,i)),bounds:[0,100],guides:[20,80]};
  }
  if(type==='macd'){
    const fast=ema(closes,12),slow=ema(closes,26);
    const main=fast.map((v,i)=>v-slow[i]);
    return {name:'MACD(12,26,9)',main,signal:ema(main,9),guides:[0]};
  }
  if(type==='ma-osc'){
    const fast=sma(closes,5),slow=sma(closes,10);
    return {name:'均线摆动指数(5−10)',main:fast.map((v,i)=>v===null||slow[i]===null?null:v-slow[i]),guides:[0]};
  }
  const period=Math.min(5,Math.max(2,Math.floor(closes.length/3)));
  return {name:`动力指数(${period})`,main:closes.map((v,i)=>i<period?null:v-closes[i-period]),guides:[0]};
}
// The source book identifies signal positions, but does not supply a downloadable
// OHLC data set. These curves reproduce those relationships as teaching diagrams.
function studyCurve(n,anchors){
  return Array.from({length:n},(_,i)=>{
    let a=anchors[0],b=anchors[anchors.length-1];
    for(let j=0;j<anchors.length-1;j++)if(i>=anchors[j][0]&&i<=anchors[j+1][0]){a=anchors[j];b=anchors[j+1];break;}
    return a[1]+(b[1]-a[1])*(b[0]===a[0]?0:(i-a[0])/(b[0]-a[0]));
  });
}
function bookIndicator(candles,type,fig){
  const n=candles.length,number=(fig||'').match(/14\.(\d+)/)?.[1];
  const key=number?`14.${number}`:'';
  if(fig==='术语表B：超买与超卖')return {name:'RSI 概念示意：70超买 / 30超卖',main:studyCurve(n,[[0,45],[4,84],[6,60],[9,16],[11,43]]),bounds:[0,100],guides:[30,70],illustrative:true};
  const diagrams={
    '14.1':{main:[[0,42],[8,82],[12,52],[17,73],[24,51],[32,26],[38,45]],bounds:[0,100],guides:[30,70],name:'RSI(9)：蓝线 / 70超买 / 30超卖',trendLine:{from:[3,51],to:[21,64]}},
    '14.2':{main:[[0,62],[10,40],[17,28],[20,38],[24,35],[31,68],[35,53]],bounds:[0,100],guides:[30,70],name:'RSI(9)：蓝线 / 70超买 / 30超卖'},
    '14.3':{main:[[0,0.03],[17,-0.045],[21,-0.015],[24,-0.026],[32,0.015],[39,0.028]],guides:[0],name:'均线摆动指数：锤子处更高低点'},
    '14.4':{main:[[0,0.7],[12,-1.2],[20,1.2],[28,2.1],[33,1.15],[41,-1.2]],guides:[0],name:'均线摆动指数：价格新高 / 指数更低高点'},
    '14.5':{main:[[0,-0.2],[3,2.5],[8,1.6],[13,2.1],[16,2.4],[19,3],[21,2.3],[22,0.7],[24,2.6],[25,1],[27,2.5],[28,0.3],[29,-0.2]],guides:[0],name:'均线摆动指数：超买仍需蜡烛或窗口确认'},
    '14.6':{main:[[0,47],[4,91],[5,76],[10,30],[16,11],[18,12],[19,27],[26,65]],signal:[[0,42],[4,81],[5,83],[10,39],[16,19],[18,19],[19,17],[26,54]],bounds:[0,100],guides:[20,80],name:'随机指数：超买下穿 / 超卖上穿'},
    '14.7':{main:[[0,45],[7,13],[8,15],[9,26],[17,72],[25,91],[28,88],[29,72],[33,30]],signal:[[0,49],[7,20],[8,19],[9,18],[17,62],[25,82],[28,81],[29,83],[33,45]],bounds:[0,100],guides:[20,80],name:'随机指数：低位上穿 / 高位下穿'},
    '14.8':{main:[[0,-0.2],[11,0.55],[16,0.2],[22,0.6],[26,0.19],[30,-0.15],[35,-0.25]],signal:[[0,-0.15],[11,0.35],[16,0.25],[22,0.38],[26,0.31],[30,0.05],[35,-0.12]],guides:[0],name:'MACD：乌云盖顶先于看跌交叉'},
    '14.9':{main:[[0,0.1],[16,0.9],[20,1.1],[22,1.03],[23,0.85],[28,-0.4],[32,-0.6]],signal:[[0,0.05],[16,0.65],[20,0.85],[22,0.94],[23,0.96],[28,-0.1],[32,-0.42]],guides:[0],name:'MACD：看跌吞没附近的下穿'},
    '14.10':{main:[[0,-2],[3,-1],[5,-0.5],[6,0.2],[12,2],[16,1.4],[17,1.1],[18,0.8],[23,-1]],signal:[[0,-1],[3,-0.7],[5,-0.4],[6,-0.1],[12,1.4],[16,1.2],[17,1.05],[18,1],[23,-0.6]],guides:[0],name:'MACD：蜡烛图信号先于两次交叉'}
  };
  const d=diagrams[key];
  if(!d)return indicatorSeries(candles,type);
  return {...d,main:studyCurve(n,d.main),signal:d.signal?studyCurve(n,d.signal):undefined,illustrative:true};
}
function volumeSeries(candles,marks){
  const values=candles.map((c,i)=>.72+Math.abs(c[3]-c[0])/Math.max(.01,c[1]-c[2])*.38+(i%5)*.09);
  (marks||[]).forEach(m=>{
    const i=Math.round(m.x),label=m.label||'';
    if(i<0||i>=values.length)return;
    if(/前纺锤线量轻、后长白量重|黑线量轻、白线量重/.test(label)&&i>0){values[i-1]=.38;values[i]=2.3;}
    if(/巨量|超级|井喷|放量|格外重大|超大/.test(label))values[i]=2.8;
    if(/量轻|太轻/.test(label))values[i]=.38;
  });
  return values;
}
function svgPath(values,x,y){
  let started=false,path='';
  values.forEach((v,i)=>{
    if(!Number.isFinite(v)){started=false;return;}
    path+=(started?' L ':' M ')+x(i)+' '+y(v);started=true;
  });
  return path;
}
function caseChartSVG(series,opts){
  opts=opts||{};
  series=series||[];
  const trend=opts.trend||[], marks=opts.marks||[], dates=opts.dates||[];
  const H=opts.height||300;
  const W=opts.width||760,padL=46,padR=12,padT=10,padB=22;
  const subchart=Boolean(opts.indicator||opts.volume);
  const panelY=subchart?H-(opts.indicator&&/RSI/.test(opts.indicator.name||'')?125:94):H-padB;
  const plotW=W-padL-padR,plotH=panelY-padT-(subchart?16:0);
  const n=series.length||1;
  let lo=Infinity,hi=-Infinity;
  series.forEach(c=>{lo=Math.min(lo,c[2]);hi=Math.max(hi,c[1]);});
  trend.forEach(t=>{
    if(!t.from||!t.to)return;
    const [x1,y1]=t.from,[x2,y2]=t.to;
    if(Math.max(x1,x2)<0||Math.min(x1,x2)>n-1)return;
    const a=Math.max(0,Math.min(x1,x2)),b=Math.min(n-1,Math.max(x1,x2));
    const at=x=>x1===x2?y1:y1+(y2-y1)*(x-x1)/(x2-x1);
    lo=Math.min(lo,at(a),at(b));hi=Math.max(hi,at(a),at(b));
  });
  marks.forEach(m=>{if(m&&typeof m.y==='number'){lo=Math.min(lo,m.y);hi=Math.max(hi,m.y);}});
  if(!isFinite(lo)){lo=0;hi=1;}
  const pad=(hi-lo)*0.07||1;lo-=pad;hi+=pad;
  const step=plotW/n,bw=Math.max(1.2,Math.min(9,step*0.55));
  const y=v=>padT+plotH*(hi-v)/(hi-lo);
  const x=i=>padL+(i+0.5)*step;
  const ticks=niceTicks(lo,hi,4);
  let s=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="案例价格走势图" data-lo="${lo}" data-hi="${hi}" data-plot-height="${plotH}" data-pad-top="${padT}" data-pad-left="${padL}" data-plot-width="${plotW}" data-count="${n}" data-dates="${encodeURIComponent(JSON.stringify(dates))}" data-series="${encodeURIComponent(JSON.stringify(series))}" data-indicator="${encodeURIComponent(JSON.stringify(opts.indicator||null))}" data-volume="${encodeURIComponent(JSON.stringify(opts.volume||null))}">`;
  ticks.forEach(t=>{
    const ty=y(t);
    s+=`<line class="kv-grid" x1="${padL}" y1="${ty}" x2="${W-padR}" y2="${ty}"/>`;
    s+=`<text class="kv-tick" x="${padL-6}" y="${ty+3}" text-anchor="end">${fmtPrice(t)}</text>`;
  });
  if(opts.showGaps){
    for(let i=1;i<series.length;i++){
      const a=series[i-1],b=series[i];
      const gap=b[2]>a[1]?[b[2],a[1]]:(b[1]<a[2]?[a[2],b[1]]:null);
      if(!gap)continue;
      const gx=x(i-1)+bw/2+2,gw=Math.max(4,x(i)-x(i-1)-bw-4);
      s+=`<rect class="kv-gap" x="${gx}" y="${y(gap[0])}" width="${gw}" height="${Math.max(3,y(gap[1])-y(gap[0]))}"/>`;
    }
  }
  series.forEach((c,i)=>{
    const cx=x(i),up=c[3]>=c[0],cls=up?'kv-up':'kv-down';
    s+=`<line class="kv-wick ${cls}" x1="${cx}" y1="${y(c[1])}" x2="${cx}" y2="${y(c[2])}"/>`;
    if(opts.barStyle)s+=`<line class="kv-wick ${cls}" x1="${cx-bw/2}" y1="${y(c[0])}" x2="${cx}" y2="${y(c[0])}"/><line class="kv-wick ${cls}" x1="${cx}" y1="${y(c[3])}" x2="${cx+bw/2}" y2="${y(c[3])}"/>`;
    else{const oy=y(c[0]),cy=y(c[3]),bt=Math.min(oy,cy),bh=Math.max(Math.abs(cy-oy),1.4);s+=`<rect class="kv-body ${cls}" x="${cx-bw/2}" y="${bt}" width="${bw}" height="${bh}"/>`;}
  });
  if(opts.ma){
    s+=`<path class="kv-ma-fast" d="${svgPath(opts.ma.fast,x,y)}"/><path class="kv-ma-slow" d="${svgPath(opts.ma.slow,x,y)}"/>`;
    s+=`<text class="kv-panel-label" x="${padL+5}" y="${padT+12}">蓝：5期均线　橙：10期均线</text>`;
  }
  trend.forEach(t=>{
    const cls=t.t==='sup'?'kv-sup':(t.t==='res'?'kv-res':'kv-tline');
    if(!t.from||!t.to)return;
    // clip segment to plot rect [padL, W-padR] x [padT, H-padB]
    let x1=x(t.from[0]),y1=y(t.from[1]),x2=x(t.to[0]),y2=y(t.to[1]);
    const minX=padL,maxX=W-padR,minY=padT,maxY=padT+plotH;
    const dx=x2-x1,dy=y2-y1;
    let t0=0,t1=1;
    const clips=[[-dx,x1-minX],[dx,maxX-x1],[-dy,y1-minY],[dy,maxY-y1]];
    let ok=true;
    for(const[p,q]of clips){
      if(p===0){if(q<0){ok=false;break;}}
      else{const r=q/p;if(p<0){if(r>t1)ok=false;if(r>t0)t0=r;}else{if(r<t0)ok=false;if(r<t1)t1=r;}}
    }
    if(!ok||t1<=t0)return;
    const sx=x1,sy=y1;x1=sx+t0*dx;y1=sy+t0*dy;x2=sx+t1*dx;y2=sy+t1*dy;
    s+=`<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    if(t.label){
      const label=t.label.length>14?t.label.slice(0,13)+'…':t.label;
      const half=Math.min(150,label.length*7);
      const mx=Math.min(Math.max((x1+x2)/2,minX+half+4),maxX-half-4),my=Math.min(Math.max((y1+y2)/2,minY+10),maxY-6);
      s+=`<text class="kv-tlab ${cls}" x="${mx}" y="${my-5}" text-anchor="middle">${escapeHTML(label)}</text>`;
    }
  });
  marks.forEach(m=>{
    if(!m||typeof m.x!=='number')return;
    const mx=x(m.x),my=y(m.y);
    s+=`<circle class="kv-markdot" cx="${mx}" cy="${my}" r="3"/>`;
    if(m.label)s+=`<text class="kv-marklab" x="${mx+6}" y="${my-4}">${escapeHTML(m.label)}</text>`;
  });
  if(opts.indicator){
    const ind=opts.indicator,pTop=panelY+5,pBottom=H-padB-3;
    const values=[...ind.main,...(ind.signal||[])].filter(Number.isFinite);
    let min=ind.bounds?ind.bounds[0]:Math.min(0,...values),max=ind.bounds?ind.bounds[1]:Math.max(0,...values);
    if(min===max){min-=1;max+=1;}
    const iy=v=>pBottom-(v-min)/(max-min)*(pBottom-pTop);
    s+=`<line class="kv-grid" x1="${padL}" y1="${panelY}" x2="${W-padR}" y2="${panelY}"/>`;
    (ind.guides||[]).forEach(v=>{
      const rsi=/RSI/.test(ind.name||'');
      s+=`<line class="${rsi?(v===70?'kv-rsi-high':'kv-rsi-low'):'kv-panel-grid'}" x1="${padL}" y1="${iy(v)}" x2="${W-padR}" y2="${iy(v)}"/>`;
      if(rsi)s+=`<text class="kv-rsi-label ${v===70?'kv-rsi-high-label':'kv-rsi-low-label'}" x="${W-padR-5}" y="${iy(v)-4}" text-anchor="end">${v} ${v===70?'超买':'超卖'}</text>`;
    });
    if(ind.trendLine){
      const {from,to}=ind.trendLine;
      s+=`<line class="kv-rsi-trend" x1="${x(from[0])}" y1="${iy(from[1])}" x2="${x(to[0])}" y2="${iy(to[1])}"/>`;
    }
    s+=`<path class="kv-ind-main" d="${svgPath(ind.main,x,iy)}"/>`;
    if(ind.signal){
      if((ind.name||'').includes('MACD'))ind.main.forEach((v,i)=>{const delta=v-ind.signal[i],zero=iy(0),yy=iy(delta);s+=`<rect class="${delta>=0?'kv-ind-hist-up':'kv-ind-hist-down'}" x="${x(i)-bw/3}" y="${Math.min(yy,zero)}" width="${bw*2/3}" height="${Math.max(1,Math.abs(yy-zero))}"/>`;});
      s+=`<path class="kv-ind-signal" d="${svgPath(ind.signal,x,iy)}"/>`;
    }
    (ind.points||[]).forEach(point=>{
      const v=ind.main[point.x];if(!Number.isFinite(v))return;
      s+=`<circle class="kv-markdot" cx="${x(point.x)}" cy="${iy(v)}" r="3.5"/><text class="kv-marklab" x="${x(point.x)+6}" y="${iy(v)-6}">${escapeHTML(point.label)}</text>`;
    });
    s+=`<text class="kv-panel-label" x="${padL+5}" y="${pTop+10}">${escapeHTML(/RSI/.test(ind.name||'')?ind.name.split('：')[0]:ind.name)}</text>`;
  }
  if(opts.volume){
    const values=opts.volume,max=Math.max(1,...values),base=H-padB-3,barH=66;
    s+=`<line class="kv-grid" x1="${padL}" y1="${panelY}" x2="${W-padR}" y2="${panelY}"/>`;
    values.forEach((v,i)=>s+=`<rect class="${series[i][3]>=series[i][0]?'kv-volume-up':'kv-volume-down'}" x="${x(i)-bw/2}" y="${base-v/max*barH}" width="${bw}" height="${v/max*barH}"/>`);
    s+=`<text class="kv-panel-label" x="${padL+5}" y="${panelY+15}">示意相对成交量</text>`;
  }
  const k=Math.max(1,Math.ceil(n/6));
  for(let i=0;i<n;i+=k){
    if(dates[i])s+=`<text class="kv-date" x="${x(i)}" y="${H-7}" text-anchor="middle">${escapeHTML(dates[i])}</text>`;
  }
  return s+'</svg>';
}
function caseFigHTML(o){
  o=o||{};
  const bookFigure=Boolean(o.fig);
  const showGaps=/gap|window|tasuki/.test(o.id||'')||['rain-drop','breakout','gaps','island'].includes(o.id);
  const barStyle=o.id==='bar-chart';
  const numberedMarks=(o.marks||[]).map((m,i)=>({...m,label:String(i+1)}));
  const all=o.candle||[];
  const chartTrend=o.ch==='ch13'?(o.trend||[]).filter(t=>!/移动平均线|均线/.test(t.label||'')):[...(o.trend||[])];
  if(o.ch==='gA'&&['on-neck','in-neck','thrusting'].includes(o.id)&&all.length>=3){
    const prior=all[1],level=o.id==='on-neck'?prior[2]:o.id==='in-neck'?prior[3]:(prior[0]+prior[3])/2;
    chartTrend.push({t:'res',from:[1,level],to:[2,level],label:o.id==='on-neck'?'前黑线最低点':o.id==='in-neck'?'前黑线收市价':'前黑实体中点'});
  }
  const closes=all.map(c=>c[3]);
  const ma=o.ch==='ch13'?{fast:sma(closes,5),slow:sma(closes,10)}:null;
  const indicator=o.ch==='ch14'||o.ch==='ch17'||o.id==='overbought-oversold'?bookIndicator(all,o.ch==='ch17'?'ma-osc':(o.id==='osc-basics'||o.id==='overbought-oversold'?'rsi':o.id),o.id==='overbought-oversold'?'术语表B：超买与超卖':o.fig):null;
  if(indicator)indicator.points=numberedMarks.map(m=>({x:m.x,label:m.label}));
  if(o.ch==='ch17')indicator.name='示意摆动指数(5−10)';
  const volume=o.ch==='ch15'?volumeSeries(all,o.marks):null;
  const hasPanel=Boolean(indicator||volume);
  const svg=caseChartSVG(all,{trend:chartTrend,marks:numberedMarks,dates:o.dates,height:hasPanel?350:300,showGaps,ma,indicator,volume,barStyle});
  const relevant=(o.marks||[]).find(m=>m.label&&o.cn&&m.label.includes(o.cn.slice(0,2)));
  const focusAt=typeof o.focus==='number'?o.focus:(relevant||((o.marks||[])[0])||{}).x;
  const center=o.id==='rsi'&&numberedMarks.length>=2?Math.round((numberedMarks[0].x+numberedMarks[1].x)/2):(Number.isFinite(focusAt)?Math.round(focusAt):Math.max(0,all.length-5));
  const detailCount=Math.min(all.length,o.id==='rsi'?24:(hasPanel?16:9));
  const from=Math.max(0,Math.min(center-Math.floor(detailCount/2),all.length-detailCount));
  const to=Math.min(all.length,from+detailCount);
  const focusedMarks=numberedMarks.filter(m=>m.x>=from&&m.x<to).map(m=>({...m,x:m.x-from}));
  const focusedDates=(o.dates||[]).slice(from,to);
  const focusedTrend=chartTrend.filter(t=>t.from&&t.to&&Math.max(t.from[0],t.to[0])>=from&&Math.min(t.from[0],t.to[0])<to).map(t=>({...t,from:[t.from[0]-from,t.from[1]],to:[t.to[0]-from,t.to[1]]}));
  const focusedTrendLine=indicator?.trendLine?{from:[indicator.trendLine.from[0]-from,indicator.trendLine.from[1]],to:[indicator.trendLine.to[0]-from,indicator.trendLine.to[1]]}:null;
  const focusedIndicator=indicator?{...indicator,main:indicator.main.slice(from,to),signal:indicator.signal&&indicator.signal.slice(from,to),points:indicator.points.filter(p=>p.x>=from&&p.x<to).map(p=>({...p,x:p.x-from})),trendLine:focusedTrendLine&&focusedTrendLine.from[0]>=0&&focusedTrendLine.to[0]<to-from?focusedTrendLine:null}:null;
  const focusedMa=ma?{fast:ma.fast.slice(from,to),slow:ma.slow.slice(from,to)}:null;
  const detailSvg=all.length>9&&!o.noDetail?caseChartSVG(all.slice(from,to),{trend:focusedTrend,marks:focusedMarks,dates:focusedDates,height:hasPanel?320:260,width:620,showGaps,ma:focusedMa,indicator:focusedIndicator,volume:volume&&volume.slice(from,to),barStyle}):'';
  const marks=(o.marks||[]).filter(m=>m&&m.label).map((m,i)=>`<span><b>${i+1}</b> ${escapeHTML(m.label)}</span>`).join('');
  const rsiLegend=o.id==='rsi'?`<div class="rsi-legend" aria-label="RSI 图例"><span class="curve">━ RSI 曲线</span><span class="high">┄ 70 超买线</span><span class="low">┄ 30 超卖线</span>${/14\.1/.test(o.fig||'')?'<span class="trend">┄ 上升趋势线</span>':''}</div>`:'';
  const frame=chart=>`${rsiLegend}<div class="chart-readout" aria-live="polite">轻触或移动到蜡烛线上查看日期、开高低收及指标</div><div class="chart-frame"><div class="chart-viewport"><div class="case-chart${hasPanel?' with-subchart':''}" tabindex="0" role="group" aria-label="交互式案例图；左右方向键切换蜡烛线">${chart}</div><div class="chart-crosshair" aria-hidden="true"><i class="cross-v"></i><i class="cross-h"></i><span class="cross-price"></span><span class="cross-date"></span></div></div><div class="chart-controls" aria-label="图表缩放"><button type="button" data-chart-zoom="in" aria-label="放大图表">＋</button><button type="button" data-chart-zoom="out" aria-label="缩小图表">－</button><button type="button" data-chart-zoom="reset" aria-label="恢复图表原始大小">复位</button></div></div>`;
  return `<div class="case-fig">`+
    `<div class="source-panel"><div><b>书中对应：</b>${escapeHTML(o.fig||'本章概念说明')}</div><div><b>标的与位置：</b>${escapeHTML(o.t||'概念示意')} · ${escapeHTML(o.f||'未注明周期')} · ${escapeHTML(o.d||'见书中说明')}</div>${marks?`<div class="key-marks"><b>关键标注：</b>${marks}</div>`:''}<div><b>核对依据：</b>${escapeHTML(o.c||'按书中形态定义绘制，请结合前后趋势和实体位置判断。')}</div></div>`+
    (detailSvg?`<div class="chart-label">关键位置放大</div>${frame(detailSvg)}`:'')+
    `<div class="chart-label">${bookFigure?'书中图例走势重绘':'概念示意重绘'}</div>`+
    `<div class="chart-hint">${bookFigure?'依据书中图例文字和关键位置示意':'依据书中概念绘制'}；可横向滑动、用图表下方按钮缩放，非原书图像或精确行情数据。${showGaps?'蓝色区间表示价格跳空。':''}${ma?'均线由示意收市价计算。':''}${indicator?(indicator.illustrative?'下方指数按书中信号位置重绘，仅表达背离与交叉关系，非实际指数读数。':'下方指数由示意数据计算。'):''}${o.id==='rsi'?'RSI区域中蓝线是指数曲线，红色70线为超买界，绿色30线为超卖界；图14.1紫色虚线是RSI上升趋势线。':''}${volume?'下方为示意相对成交量，非原书成交量数据。':''}</div>`+
    frame(svg)+
    `<div class="ct"><span>标的：<b>${escapeHTML(o.t||'')}</b></span><span>周期：<b>${escapeHTML(o.f||'')}</b></span><span>时间：<b>${escapeHTML(o.d||'')}</b></span></div>`+
    `</div>`;
}

/* ---- 渲染 ---- */
let READING_KEY='ying-candle-reading-v1';
function normalizeReading(value){
  const source=value&&typeof value==='object'?value:{};
  const favoriteEdits=Object.create(null);
  if(source.favoriteEdits&&typeof source.favoriteEdits==='object')for(const [id,edit] of Object.entries(source.favoriteEdits)){
    if(typeof id==='string'&&id.length<=100&&edit&&typeof edit.saved==='boolean'&&Number.isFinite(edit.at)&&edit.at>=0)favoriteEdits[id]={saved:edit.saved,at:edit.at};
  }
  if(Array.isArray(source.favorites))for(const id of source.favorites){
    if(typeof id==='string'&&id.length<=100&&!Object.hasOwn(favoriteEdits,id))favoriteEdits[id]={saved:true,at:1};
  }
  return {chapter:typeof source.chapter==='string'?source.chapter:'ch01',last:typeof source.last==='string'?source.last:'',
    scrollY:Number.isFinite(source.scrollY)&&source.scrollY>=0?source.scrollY:0,
    updatedAt:Number.isFinite(source.updatedAt)&&source.updatedAt>=0?source.updatedAt:0,
    favorites:Object.keys(favoriteEdits).filter(id=>favoriteEdits[id].saved),favoriteEdits};
}
function mergeReading(local,remote){
  const a=normalizeReading(local),b=normalizeReading(remote),latest=a.updatedAt>=b.updatedAt?a:b;
  const edits=Object.assign(Object.create(null),a.favoriteEdits);
  for(const [id,edit] of Object.entries(b.favoriteEdits)){
    const previous=edits[id];
    if(!previous||edit.at>previous.at||(edit.at===previous.at&&!edit.saved))edits[id]=edit;
  }
  return normalizeReading({...latest,favoriteEdits:edits,favorites:Object.keys(edits).filter(id=>edits[id].saved)});
}
function storedReading(){try{return normalizeReading(JSON.parse(localStorage.getItem(READING_KEY)||'{}'))}catch(e){return normalizeReading(null)}}
let reading=storedReading();
let favoritesOnly=false;
let readingToken='',readingSyncTimer=null,readingSyncRunning=false,readingUiDirty=false;
const READING_API='https://ronghe-risk-free.shuyaolu93.workers.dev/api/candle/reading';
function persistReading(){try{localStorage.setItem(READING_KEY,JSON.stringify(reading))}catch(e){}}
function readingStatus(message){document.getElementById('readingSyncStatus').textContent=message}
function queueReadingSync(){
  if(!readingToken)return;
  clearTimeout(readingSyncTimer);
  readingSyncTimer=setTimeout(syncReading,1500);
}
function saveReading(){reading.updatedAt=Date.now();reading=normalizeReading(reading);persistReading();readingStatus('进度已保存在此浏览器，正在同步…');queueReadingSync()}
async function readingRequest(method,body){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
  let response;
  try{response=await fetch(READING_API,{method,cache:'no-store',signal:controller.signal,headers:{authorization:'Bearer '+readingToken,'content-type':'application/json'},body:body?JSON.stringify(body):undefined})}
  finally{clearTimeout(timeout)}
  const data=await response.json();
  if(!response.ok){const error=new Error(data.message||'阅读进度同步失败');error.status=response.status;throw error;}
  return data;
}
async function syncReading(){
  if(!readingToken||readingSyncRunning)return;
  readingSyncRunning=true;
  try{
    for(let attempt=0;attempt<3;attempt++){
      const remote=await readingRequest('GET');
      const merged=mergeReading(reading,remote.reading);
      try{
        if(JSON.stringify(merged)!==JSON.stringify(remote.reading))await readingRequest('PUT',{revision:remote.revision,reading:merged});
        const changed=JSON.stringify(reading)!==JSON.stringify(merged);
        reading=mergeReading(reading,merged);
        persistReading();
        readingStatus('阅读进度已同步到账号');
        if(changed&&catalogueLoaded){
          if(document.getElementById('modal').classList.contains('open'))readingUiDirty=true;
          else build();
        }
        if(JSON.stringify(reading)!==JSON.stringify(merged))queueReadingSync();
        return;
      }catch(error){if(error.status!==409)throw error;}
    }
    queueReadingSync();
  }catch(error){
    readingStatus(error.status===401||error.status===403?'登录或卡密已失效，进度保存在此浏览器':'云端暂不可用，进度保存在此浏览器');
    if(error.status!==401&&error.status!==403){clearTimeout(readingSyncTimer);readingSyncTimer=setTimeout(syncReading,30000);}
  }finally{readingSyncRunning=false;}
}
let readingScrollTimer;
window.addEventListener('scroll',()=>{clearTimeout(readingScrollTimer);readingScrollTimer=setTimeout(()=>{reading.scrollY=window.scrollY;saveReading()},350)},{passive:true});
function updateContinue(){
  const button=document.getElementById('continueReading');
  const p=PATTERNS.find(x=>x.id===reading.last);
  button.hidden=!p;
  if(p)button.textContent='继续阅读 · '+p.cn;
}
function updateModalFavorite(id){
  const button=document.getElementById('modalFavorite'),saved=reading.favorites.includes(id);
  button.dataset.id=id;button.setAttribute('aria-pressed',String(saved));button.textContent=saved?'★ 已收藏':'☆ 收藏';
}
function toggleFavorite(id){
  const saved=!reading.favorites.includes(id);
  reading.favoriteEdits[id]={saved,at:Date.now()};
  reading.favorites=Object.keys(reading.favoriteEdits).filter(key=>reading.favoriteEdits[key].saved);
  saveReading();
  document.querySelectorAll('.fav-toggle').forEach(b=>{if(b.dataset.id!==id)return;b.setAttribute('aria-pressed',String(reading.favorites.includes(id)));b.textContent=reading.favorites.includes(id)?'★':'☆';b.setAttribute('aria-label',(reading.favorites.includes(id)?'取消收藏 ':'收藏 ')+PATTERNS.find(p=>p.id===id)?.cn)});
  updateModalFavorite(id);
  if(favoritesOnly)build();
}
function matchedPatterns(){
  const query=document.getElementById('patternSearch').value.trim().toLocaleLowerCase('zh-CN');
  const chapter=document.getElementById('chapterFilter').value;
  const signal=document.getElementById('signalFilter').value;
  const kind=document.getElementById('kindFilter').value;
  return PATTERNS.filter(p=>{
    const ch=CHAPTERS.find(c=>c.id===p.ch);
    const haystack=[p.cn,p.en,p.desc,p.def,p.note,p.case?.t,p.source,...(p.sections||[]).flatMap(s=>[s.title,s.body]),ch?.num,ch?.name].join(' ').toLocaleLowerCase('zh-CN');
    return (!query||haystack.includes(query))&&(!chapter||p.ch===chapter)&&(!signal||p.sig===signal)&&(!kind||p.kind===kind)&&(!favoritesOnly||reading.favorites.includes(p.id));
  });
}
function initFilters(){
  document.getElementById('chapterFilter').innerHTML+=CHAPTERS.map(ch=>`<option value="${ch.id}">${ch.num} ${ch.name}</option>`).join('');
  document.getElementById('kindFilter').innerHTML+=[...new Set(PATTERNS.map(p=>p.kind))].map(kind=>`<option value="${escapeHTML(kind)}">${escapeHTML(kind)}</option>`).join('');
  document.querySelectorAll('#patternSearch,#chapterFilter,#signalFilter,#kindFilter').forEach(control=>control.addEventListener(control.tagName==='INPUT'?'input':'change',build));
}
function build(){
  document.getElementById('mTotal').textContent=PATTERNS.length;
  const matches=matchedPatterns();
  const filtering=Boolean(document.getElementById('patternSearch').value.trim()||document.getElementById('chapterFilter').value||document.getElementById('signalFilter').value||document.getElementById('kindFilter').value||favoritesOnly);
  const chaptersWithMatches=CHAPTERS.filter(ch=>matches.some(p=>p.ch===ch.id));
  const openId=reading.chapter===''&&!filtering?null:(chaptersWithMatches.some(ch=>ch.id===reading.chapter)?reading.chapter:chaptersWithMatches[0]?.id);
  document.getElementById('findCount').textContent=`找到 ${matches.length} / ${PATTERNS.length} 个条目`;
  const main=document.getElementById('main');
  main.innerHTML=CHAPTERS.map(ch=>{
    const list=matches.filter(p=>p.ch===ch.id);
    if(!list.length)return '';
    const open=ch.id===openId;
    return `<section class="chapter${open?'':' collapsed'}" id="${ch.id}">
      <div class="ch-head">
        <span class="ch-num">${ch.num}</span><h2>${ch.name}</h2><span class="en">${ch.en}</span><span class="count">${list.length} ${ch.unit||'个形态'}</span>
        <button class="chapter-toggle" type="button" data-chapter-toggle="${ch.id}" aria-controls="${ch.id}-body" aria-expanded="${open}"><span class="triangle" aria-hidden="true">${open?'▾':'▸'}</span><span class="toggle-label">${open?'折叠':'展开'}</span></button>
      </div>
      <div class="chapter-body" id="${ch.id}-body" ${open?'':'hidden'}>
        <p class="ch-note">${ch.note}</p>
        ${chapterGuideHTML(ch)}
        <div class="grid" style="margin-top:18px">${list.map(cardHTML).join('')}</div>
      </div>
    </section>`;
  }).join('')||(filtering?'<p class="empty-search">没有找到匹配的条目，请换个关键词或筛选条件。</p>':'');
  document.querySelectorAll('.tchip').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.goto===openId)));
  updateContinue();
}
function cardHTML(p){
  const s=p.sig==='看涨'?'up':(p.sig==='看跌'?'down':'neu');
  const visual=p.lesson?`<span class="cv lesson-cover">${lessonDiagram(p)||`<small>${CHAPTERS.find(c=>c.id===p.ch)?.num||''}</small><span>${String(PATTERNS.filter(x=>x.ch===p.ch).indexOf(p)+1).padStart(2,'0')}</span>`}</span>`:`<span class="cv">${schematicSVG(p)}</span>`;
  return `<div class="cell-wrap"><button class="cell" data-id="${escapeHTML(p.id)}" aria-label="查看 ${escapeHTML(p.cn)} 详情">
    ${visual}
    <span class="title-row"><span class="tag">${escapeHTML(p.kind)}</span><span class="cn">${escapeHTML(p.cn)}</span>${p.sig?`<span class="tag ${s}">${escapeHTML(p.sig)}</span>`:''}</span>
    <span class="ds">${escapeHTML(p.desc)}</span>
    <span class="ds">${escapeHTML(p.fig||p.source||'书中章节内容')}</span>
  </button><button class="fav-toggle" type="button" data-id="${escapeHTML(p.id)}" aria-label="${reading.favorites.includes(p.id)?'取消收藏':'收藏'} ${escapeHTML(p.cn)}" aria-pressed="${reading.favorites.includes(p.id)}">${reading.favorites.includes(p.id)?'★':'☆'}</button></div>`;
}
function tagHTML(p){
  const s=p.sig==='看涨'?'up':(p.sig==='看跌'?'down':'neu');
  const ch=CHAPTERS.find(c=>c.id===p.ch);
  return `${p.sig?`<span class="tag ${s}">${escapeHTML(p.sig)}</span>`:''}<span class="tag">${escapeHTML(p.kind)}</span><span class="tag">${escapeHTML(ch?ch.num:p.ch)}</span>`;
}
let modalReturnFocus=null;
function showModal(){
  const modal=document.getElementById('modal');
  modalReturnFocus=document.activeElement;
  modal.classList.add('open');
  for(const sibling of document.body.children)if(sibling!==modal&&sibling instanceof HTMLElement)sibling.inert=true;
  document.body.style.overflow='hidden';
  modal.querySelector('.close').focus();
}
function openModal(id){
  const p=PATTERNS.find(x=>x.id===id); if(!p)return;
  reading.last=id;reading.chapter=p.ch;saveReading();updateContinue();updateModalFavorite(id);
  const ch=CHAPTERS.find(c=>c.id===p.ch);
  document.getElementById('mCh').textContent=(ch?ch.num+' '+ch.name:'');
  document.getElementById('mTitle').textContent=p.cn;
  document.getElementById('mTags').innerHTML=tagHTML(p);
  document.getElementById('mDefinitionLabel').textContent=p.lesson?'内容梳理':'形态定义';
  document.getElementById('mNoteLabel').textContent=p.lesson?'记住这一点':'识别要点';
  document.getElementById('mCaseLabel').textContent=p.lesson?'书中位置':'图例与说明';
  const diagram= p.lesson?lessonDiagram(p,true):schematicSVG(p,true);
  document.getElementById('mCandle').hidden=Boolean(p.lesson&&!diagram);
  document.getElementById('diagramLabel').hidden=Boolean(p.lesson&&!diagram);
  document.getElementById('diagramLabel').textContent=p.lesson?'章节概念示意 · 按书中说明绘制':'形态教学示意 · 按书中定义绘制';
  document.getElementById('mCandle').innerHTML=diagram;
  document.getElementById('mBody').innerHTML=p.lesson?`<p class="lesson-intro">${escapeHTML(p.def)}</p>${(p.sections||[]).map(s=>`<h3>${escapeHTML(s.title)}</h3><p>${escapeHTML(s.body)}</p>`).join('')}`:`<p>${escapeHTML(p.def)}</p>`;
  document.getElementById('mNote').textContent=p.note;
  if(p.lesson){
    document.getElementById('mCase').innerHTML=`<p class="lesson-source">${escapeHTML(p.source||'')}</p>`;
    showModal();
    return;
  }
  const cs1=p.case||{};
  const figs=[caseFigHTML({id:p.id,ch:p.ch,cn:p.cn,focus:p.focus,candle:p.candle,trend:p.trend,marks:p.marks,dates:p.dates,fig:p.fig,t:cs1.t,f:cs1.f,d:cs1.d,c:cs1.c})];
  if(p.case2)figs.push(caseFigHTML({id:p.id,ch:p.ch,cn:p.cn,candle:p.case2.candle,trend:p.case2.trend,marks:p.case2.marks,dates:p.case2.dates,fig:p.case2.fig,t:p.case2.t,f:p.case2.f,d:p.case2.d,c:p.case2.c}));
  if(p.case3)figs.push(caseFigHTML({id:p.id,ch:p.ch,cn:p.cn,candle:p.case3.candle,trend:p.case3.trend,marks:p.case3.marks,dates:p.case3.dates,fig:p.case3.fig,t:p.case3.t,f:p.case3.f,d:p.case3.d,c:p.case3.c,noDetail:true}));
  document.getElementById('mCase').innerHTML=`<div class="case-figs${p.case2?' two':''}${p.case3?' three':''}${p.id==='rsi'?' rsi-figs':''}">${figs.join('')}</div>`;
  showModal();
  document.querySelectorAll('#mCase .chart-frame').forEach(frame=>{
    const chart=frame.querySelector('.case-chart'),svg=chart.querySelector('svg');
    frame.dataset.baseWidth=String(Math.max(620,chart.clientWidth-16));
    frame.dataset.scale='1';
    svg.style.width=frame.dataset.baseWidth+'px';
    frame.querySelector('[data-chart-zoom="reset"]').disabled=true;
  });
  document.querySelectorAll('#mCase .case-fig').forEach(fig=>{
    const zoom=fig.querySelector('.case-chart');
    if(zoom&&fig.querySelectorAll('.case-chart').length>1)zoom.scrollLeft=(zoom.scrollWidth-zoom.clientWidth)/2;
  });
}
function closeModal(){
  const modal=document.getElementById('modal');
  if(!modal.classList.contains('open'))return;
  const returnFocus=modalReturnFocus,returnId=returnFocus?.dataset.id;
  modal.classList.remove('open');
  for(const sibling of document.body.children)if(sibling!==modal&&sibling instanceof HTMLElement)sibling.inert=false;
  document.body.style.overflow='';
  if(readingUiDirty){build();readingUiDirty=false;}
  const target=returnFocus?.isConnected?returnFocus:[...document.querySelectorAll('.cell,.fav-toggle')].find(el=>el.dataset.id===returnId);
  target?.focus();
  modalReturnFocus=null;
}
function zoomChart(button){
  const frame=button.closest('.chart-frame'),chart=frame.querySelector('.case-chart'),svg=chart.querySelector('svg');
  const oldScale=Number(frame.dataset.scale)||1;
  const next=button.dataset.chartZoom==='reset'?1:Math.min(2.5,Math.max(.25,Math.round((oldScale+(button.dataset.chartZoom==='in'?.15:-.15))*100)/100));
  if(next===oldScale)return;
  const center=(chart.scrollLeft+chart.clientWidth/2)/svg.getBoundingClientRect().width;
  frame.dataset.scale=String(next);
  svg.style.width=Math.round(Number(frame.dataset.baseWidth)*next)+'px';
  chart.scrollLeft=center*svg.getBoundingClientRect().width-chart.clientWidth/2;
  frame.querySelector('[data-chart-zoom="in"]').disabled=next>=2.5;
  frame.querySelector('[data-chart-zoom="out"]').disabled=next<=.25;
  frame.querySelector('[data-chart-zoom="reset"]').disabled=next===1;
}
const chartDataCache=new WeakMap();
function chartData(svg){
  if(!chartDataCache.has(svg))chartDataCache.set(svg,{
    dates:JSON.parse(decodeURIComponent(svg.dataset.dates)),
    series:JSON.parse(decodeURIComponent(svg.dataset.series)),
    indicator:JSON.parse(decodeURIComponent(svg.dataset.indicator)),
    volume:JSON.parse(decodeURIComponent(svg.dataset.volume))
  });
  return chartDataCache.get(svg);
}
function updateChartReadout(chart,index){
  const frame=chart.closest('.chart-frame'),svg=chart.querySelector('svg'),data=chartData(svg);
  const candle=data.series[index];if(!candle)return;
  const parts=[data.dates[index]||`第${index+1}根`,`开 ${fmtPrice(candle[0])}`,`高 ${fmtPrice(candle[1])}`,`低 ${fmtPrice(candle[2])}`,`收 ${fmtPrice(candle[3])}`];
  const indicator=data.indicator;
  if(indicator){
    const value=indicator.main?.[index];
    if(Number.isFinite(value))parts.push(`${indicator.name||'指标'} ${fmtPrice(value)}`);
    const signal=indicator.signal?.[index];
    if(Number.isFinite(signal))parts.push(`信号线 ${fmtPrice(signal)}`);
  }
  if(Number.isFinite(data.volume?.[index]))parts.push(`相对成交量 ${fmtPrice(data.volume[index])}`);
  frame.previousElementSibling.textContent=parts.join('  ·  ')+'（示意）';
  chart.dataset.selectedIndex=String(index);
}
function moveChartCrosshair(chart,clientX,clientY){
  const frame=chart.closest('.chart-frame'),overlay=frame.querySelector('.chart-crosshair');
  const rect=frame.getBoundingClientRect(),svg=chart.querySelector('svg'),svgRect=svg.getBoundingClientRect();
  if(clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom){overlay.classList.remove('active');return;}
  overlay.style.setProperty('--cross-x',`${clientX-rect.left}px`);
  overlay.style.setProperty('--cross-y',`${clientY-rect.top}px`);
  overlay.classList.add('active');
  const vb=svg.viewBox.baseVal;
  const sx=(clientX-svgRect.left)/svgRect.width*vb.width;
  const sy=(clientY-svgRect.top)/svgRect.height*vb.height;
  const plotStart=Number(svg.dataset.padLeft),plotWidth=Number(svg.dataset.plotWidth);
  const count=Number(svg.dataset.count),index=Math.max(0,Math.min(count-1,Math.round((sx-plotStart)/plotWidth*count-.5)));
  const dates=chartData(svg).dates;
  overlay.querySelector('.cross-date').textContent=dates[index]||`第${index+1}根`;
  const price=overlay.querySelector('.cross-price'),top=Number(svg.dataset.padTop),height=Number(svg.dataset.plotHeight);
  price.textContent=sy>=top&&sy<=top+height?fmtPrice(Number(svg.dataset.hi)-(sy-top)/height*(Number(svg.dataset.hi)-Number(svg.dataset.lo))):'';
  updateChartReadout(chart,index);
}
function selectChartCandle(chart,index){
  const svg=chart.querySelector('svg'),count=Number(svg.dataset.count),i=Math.max(0,Math.min(count-1,index));
  const vb=svg.viewBox.baseVal,plotStart=Number(svg.dataset.padLeft),plotWidth=Number(svg.dataset.plotWidth);
  const x=plotStart+(i+.5)*plotWidth/count;
  const rect=svg.getBoundingClientRect();
  const clientX=rect.left+x/vb.width*rect.width;
  const clientY=rect.top+Number(svg.dataset.padTop)/vb.height*rect.height+24;
  chart.scrollLeft+=clientX-(chart.getBoundingClientRect().left+chart.clientWidth/2);
  const adjusted=svg.getBoundingClientRect();
  moveChartCrosshair(chart,adjusted.left+x/vb.width*adjusted.width,clientY);
}

/* ---- 事件 ---- */
function setChapterOpen(id, open, shouldScroll){
  const el=document.getElementById(id);
  if(!el)return;
  if(open)document.querySelectorAll('.chapter').forEach(other=>{if(other.id!==id){other.classList.add('collapsed');const body=other.querySelector('.chapter-body'),button=other.querySelector('.chapter-toggle'),nav=document.querySelector('.tchip[data-goto="'+other.id+'"]');if(body)body.hidden=true;if(button){button.setAttribute('aria-expanded','false');button.querySelector('.triangle').textContent='▸';button.querySelector('.toggle-label').textContent='展开'}if(nav)nav.setAttribute('aria-expanded','false')}});
  const body=el.querySelector('.chapter-body');
  const toggle=el.querySelector('[data-chapter-toggle]');
  const nav=document.querySelector('.tchip[data-goto="'+id+'"]');
  el.classList.toggle('collapsed', !open);
  if(body)body.hidden=!open;
  if(toggle){
    toggle.setAttribute('aria-expanded',String(open));
    const label=toggle.querySelector('.toggle-label');
    const triangle=toggle.querySelector('.triangle');
    if(label)label.textContent=open?'折叠':'展开';
    if(triangle)triangle.textContent=open?'▾':'▸';
  }
  if(nav)nav.setAttribute('aria-expanded',String(open));
  reading.chapter=open?id:'';saveReading();
  if(shouldScroll)el.scrollIntoView({behavior:'smooth',block:'start'});
}
function toggleChapter(id, shouldScroll){
  const el=document.getElementById(id);
  if(!el)return;
  const toggle=el.querySelector('[data-chapter-toggle]');
  const open=!toggle || toggle.getAttribute('aria-expanded')!=='true';
  setChapterOpen(id,open,shouldScroll);
}
const chapterNavWrap=document.getElementById('chapterNavWrap');
const chapterNavToggle=document.getElementById('chapterNavToggle');
chapterNavToggle.addEventListener('click',()=>{
  const collapsed=chapterNavWrap.classList.toggle('collapsed');
  chapterNavToggle.setAttribute('aria-expanded',String(!collapsed));
  chapterNavToggle.querySelector('.triangle').textContent=collapsed?'▸':'▾';
  chapterNavToggle.querySelector('.chapter-nav-label').textContent=collapsed?'展开章节':'章节选择';
});
document.querySelectorAll('.tchip').forEach(b=>{
  b.setAttribute('aria-expanded','true');
  b.addEventListener('click',()=>{
    if(!document.getElementById(b.dataset.goto)){
      document.getElementById('patternSearch').value='';
      document.getElementById('chapterFilter').value='';
      document.getElementById('signalFilter').value='';
      document.getElementById('kindFilter').value='';
      favoritesOnly=false;
      document.getElementById('favoriteFilter').classList.remove('active');
      document.getElementById('favoriteFilter').setAttribute('aria-pressed','false');
      document.getElementById('favoriteFilter').textContent='☆ 只看收藏';
      build();
      setChapterOpen(b.dataset.goto,true,true);
    }else toggleChapter(b.dataset.goto,true);
  });
});
document.getElementById('main').addEventListener('click',e=>{
  const toggle=e.target.closest('[data-chapter-toggle]');
  if(toggle)toggleChapter(toggle.dataset.chapterToggle,false);
});
document.getElementById('main').addEventListener('click',e=>{
  const favorite=e.target.closest('.fav-toggle');if(favorite){toggleFavorite(favorite.dataset.id);return;}
  const cell=e.target.closest('.cell'); if(cell)openModal(cell.dataset.id);
});
document.getElementById('modalFavorite').addEventListener('click',e=>toggleFavorite(e.currentTarget.dataset.id));
document.getElementById('favoriteFilter').addEventListener('click',e=>{favoritesOnly=!favoritesOnly;e.currentTarget.setAttribute('aria-pressed',String(favoritesOnly));e.currentTarget.classList.toggle('active',favoritesOnly);e.currentTarget.textContent=favoritesOnly?'★ 只看收藏':'☆ 只看收藏';build()});
document.getElementById('continueReading').addEventListener('click',()=>{const p=PATTERNS.find(x=>x.id===reading.last);if(!p)return;document.getElementById('patternSearch').value='';document.getElementById('chapterFilter').value='';document.getElementById('signalFilter').value='';document.getElementById('kindFilter').value='';favoritesOnly=false;document.getElementById('favoriteFilter').classList.remove('active');document.getElementById('favoriteFilter').setAttribute('aria-pressed','false');document.getElementById('favoriteFilter').textContent='☆ 只看收藏';reading.chapter=p.ch;saveReading();build();[...document.querySelectorAll('.cell')].find(el=>el.dataset.id===p.id)?.scrollIntoView({behavior:'smooth',block:'center'});openModal(p.id)});
document.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',closeModal));
document.getElementById('mCase').addEventListener('click',e=>{
  const button=e.target.closest('[data-chart-zoom]');
  if(button)zoomChart(button);
});
document.getElementById('mCase').addEventListener('pointermove',e=>{
  const chart=e.target.closest('.case-chart');if(chart)moveChartCrosshair(chart,e.clientX,e.clientY);
});
document.getElementById('mCase').addEventListener('pointerdown',e=>{
  const chart=e.target.closest('.case-chart');if(chart)moveChartCrosshair(chart,e.clientX,e.clientY);
});
document.getElementById('mCase').addEventListener('pointerout',e=>{
  if(e.pointerType==='mouse'&&e.target.closest('.case-chart')&&!e.relatedTarget?.closest?.('.case-chart'))e.target.closest('.chart-frame').querySelector('.chart-crosshair').classList.remove('active');
});
document.getElementById('mCase').addEventListener('touchmove',e=>{
  const touch=e.touches[0],chart=e.target.closest('.case-chart');
  if(touch&&chart)moveChartCrosshair(chart,touch.clientX,touch.clientY);
},{passive:true});
document.getElementById('mCase').addEventListener('keydown',e=>{
  const chart=e.target.closest('.case-chart');
  if(!chart||!['ArrowLeft','ArrowRight'].includes(e.key))return;
  e.preventDefault();
  selectChartCandle(chart,(Number(chart.dataset.selectedIndex)||0)+(e.key==='ArrowRight'?1:-1));
});
document.addEventListener('keydown',e=>{
  const modal=document.getElementById('modal');
  if(!modal.classList.contains('open'))return;
  if(e.key==='Escape'){e.preventDefault();closeModal();return;}
  if(e.key!=='Tab')return;
  const focusable=[...modal.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length);
  if(!focusable.length){e.preventDefault();return;}
  const first=focusable[0],last=focusable[focusable.length-1];
  if(e.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){e.preventDefault();first.focus();}
});
document.getElementById('themeToggle').addEventListener('click',()=>{
  applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark');
});
if(window.matchMedia('(max-width:700px)').matches){
  chapterNavWrap.classList.add('collapsed');
  chapterNavToggle.setAttribute('aria-expanded','false');
  chapterNavToggle.querySelector('.triangle').textContent='▸';
  chapterNavToggle.querySelector('.chapter-nav-label').textContent='展开章节';
}
let catalogueLoaded=false;
window.yingCandleLoad=async function(token,accountId){
  if(catalogueLoaded){await syncReading();return;}
  if(accountId){READING_KEY='ying-candle-reading-v1-account-'+String(accountId).replace(/[^0-9]/g,'');reading=storedReading()}
  const localScrollY=reading.scrollY;
  readingToken=token;
  const [response]=await Promise.all([fetch('https://ying-candle-data.shuyaolu93.workers.dev/api/candle/data',{
    cache:'no-store',headers:{authorization:'Bearer '+token}
  }),syncReading()]);
  if(!response.ok)throw new Error('图谱数据加载失败');
  const data=await response.json();
  if(!Array.isArray(data.patterns)||!data.patterns.length||!data.schematics)throw new Error('图谱数据不完整');
  PATTERNS=data.patterns;
  SCHEMATICS=data.schematics;
  initFilters();
  build();
  if(localScrollY>0)requestAnimationFrame(()=>window.scrollTo(0,localScrollY));
  else if(reading.last)requestAnimationFrame(()=>[...document.querySelectorAll('.cell')].find(el=>el.dataset.id===reading.last)?.scrollIntoView({block:'center'}));
  catalogueLoaded=true;
};
